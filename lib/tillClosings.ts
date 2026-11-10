/*
 * Till Closing — the cashier's end of day.
 *
 * Every till (a bank_account of type TILL, owned through Cashier Setup) is closed once per business
 * day: the cashier counts the cash in the drawer note by note (the denomination grid), the system
 * says what should be there (the till's ledger balance), and the difference is the variance.
 *
 *   Open              the cashier (or a treasury/supervisor user for any till) raises the closing,
 *                     fills the count; the day's figures refresh from the ledger on every save
 *   Pending Approval  a supervisor checks the count and the variance reason
 *   Approved          ready to post
 *   Posted            (1) any variance is booked — shortage: DR Till shortages / CR till;
 *                         overage: DR till / CR Till overages (Company Information → Cash office accounts) —
 *                         so the ledger agrees with the drawer;
 *                     (2) the counted cash is handed to treasury — DR treasury vault / CR till
 *                         (optional; a till may keep a float overnight);
 *                     (3) the till is closed for that date: no cashier or cash-office posting
 *                         may land on it with a value date on or before the closing date.
 *
 * The figures on the document are the ledger's, never typed: opening balance = the till balance
 * before the closing date, cash in/out = that day's bank_account_ledger_entry debits/credits,
 * system balance = opening + in − out (which equals bank_account.balance while nothing later
 * has posted). They are re-read at post and the post refuses if they moved since approval.
 */
import { one, all, run, tx, nextSequence, audit, hasAnyRow } from './db.ts';
import { AppError } from './errors.ts';
import { postJournal } from './accounting.ts';
import { getOrg } from './org.ts';
import { today } from './format.ts';
import { denominationTotal, replaceDenominationLines, clearDenominationLines } from './denominations.ts';
import { cashierSetupForUser, treasurySetupForUser } from './cashierSetup.ts';
import { findMatchingWorkflow, findPendingRoutedTask, pickConditionFields, startWorkflow } from './workflow.ts';
import { buildFilterClause, type FilterCondition, type FilterFieldDef } from './listFilters.ts';
import { buildOrderClause, type SortState } from './listSort.ts';
import type { Actor, Cents, IsoDate, TillClosing, TillClosingView } from './types.ts';

export type TillClosingListView = 'open' | 'pending' | 'approved' | 'posted';
const VIEW_CLAUSE: Record<TillClosingListView, string> = {
  open: "c.status = 'Open'", pending: "c.status = 'Pending Approval'", approved: "c.status = 'Approved' AND c.posted = false", posted: 'c.posted = true',
};

const SELECT_ROW = `
  SELECT c.*, t.code AS till_code, t.name AS till_name, t.balance AS till_balance_now,
         v.code AS treasury_code, v.name AS treasury_name,
         jv.journal_no AS variance_journal_no, jh.journal_no AS handover_journal_no
  FROM till_closing c
  JOIN bank_account t ON t.id = c.till_bank_account_id
  LEFT JOIN bank_account v ON v.id = c.treasury_bank_account_id
  LEFT JOIN journal jv ON jv.id = c.variance_journal_id
  LEFT JOIN journal jh ON jh.id = c.handover_journal_id`;

export const TILL_CLOSING_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text', column: 'c.no' },
  { key: 'till_bank_account_id', label: 'Till', type: 'select', column: 'c.till_bank_account_id' },
  { key: 'cashier_username', label: 'Cashier', type: 'text', column: 'c.cashier_username' },
  { key: 'closing_date', label: 'Closing Date', type: 'date', column: 'c.closing_date' },
];
const SORT_COLUMNS: Record<string, string> = {
  no: 'c.no', till: 't.code', cashier: 'c.cashier_username', closing_date: 'c.closing_date', system: 'c.system_balance', counted: 'c.counted_amount', variance: 'c.variance', status: 'c.status',
};

export interface ListTillClosingsOptions { view?: TillClosingListView; search?: string; filters?: FilterCondition[]; sort?: SortState | null }

export const listTillClosings = ({ view, search = '', filters = [], sort = null }: ListTillClosingsOptions = {}): Promise<TillClosingView[]> => {
  const { clause, params } = buildFilterClause(TILL_CLOSING_FILTER_FIELDS, filters);
  const orderBy = buildOrderClause(SORT_COLUMNS, sort, 'c.closing_date DESC, c.no DESC');
  return all<TillClosingView>(
    `${SELECT_ROW}
     WHERE (c.no ILIKE @like OR t.code ILIKE @like OR t.name ILIKE @like OR c.cashier_username ILIKE @like)
       ${view ? `AND ${VIEW_CLAUSE[view]}` : ''} ${clause}
     ${orderBy}`,
    { like: `%${String(search).trim()}%`, ...params },
  );
};
export const getTillClosing = (no: string): Promise<TillClosingView | undefined> => one<TillClosingView>(`${SELECT_ROW} WHERE c.no = ?`, no);
export const hasAnyTillClosings = (view?: TillClosingListView): Promise<boolean> => hasAnyRow('till_closing c', view ? VIEW_CLAUSE[view] : undefined);
export async function getAdjacentTillClosingNos(no: string, view?: TillClosingListView): Promise<{ prevNo: string | null; nextNo: string | null }> {
  const clause = view ? `AND ${VIEW_CLAUSE[view]}` : '';
  const [prev, next] = await Promise.all([
    one<{ no: string }>(`SELECT c.no FROM till_closing c WHERE c.no < ? ${clause} ORDER BY c.no DESC LIMIT 1`, no),
    one<{ no: string }>(`SELECT c.no FROM till_closing c WHERE c.no > ? ${clause} ORDER BY c.no ASC LIMIT 1`, no),
  ]);
  return { prevNo: prev?.no ?? null, nextNo: next?.no ?? null };
}

/* ------------------------------------------------------------------ the day's figures */

export interface TillDayFigures { openingBalance: Cents; cashIn: Cents; cashOut: Cents; systemBalance: Cents }

/** What the ledger says the till held at the start of `date`, moved during it, and holds at its end. */
export async function tillDayFigures(tillBankAccountId: number, date: IsoDate): Promise<TillDayFigures> {
  const row = await one<{ before: Cents; cash_in: Cents; cash_out: Cents }>(
    `SELECT COALESCE(SUM(CASE WHEN e.posting_date < ? THEN e.amount END), 0) AS before,
            COALESCE(SUM(CASE WHEN e.posting_date = ? AND e.amount > 0 THEN e.amount END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN e.posting_date = ? AND e.amount < 0 THEN -e.amount END), 0) AS cash_out
     FROM bank_account_ledger_entry e WHERE e.bank_account_id = ?`,
    date, date, date, tillBankAccountId,
  );
  const openingBalance = Number(row?.before ?? 0);
  const cashIn = Number(row?.cash_in ?? 0);
  const cashOut = Number(row?.cash_out ?? 0);
  return { openingBalance, cashIn, cashOut, systemBalance: openingBalance + cashIn - cashOut };
}

export interface TillDayEntry { id: number; posting_date: IsoDate; description: string | null; amount: Cents; running_balance: Cents; document_no: string | null; journal_no: string; module: string; event_type: string }

/** The till's ledger entries for the day — the audit trail behind the figures. */
export const tillDayEntries = (tillBankAccountId: number, date: IsoDate): Promise<TillDayEntry[]> =>
  all<TillDayEntry>(
    `SELECT e.id, e.posting_date, e.description, e.amount, e.running_balance, e.document_no, j.journal_no, j.module, j.event_type
     FROM bank_account_ledger_entry e JOIN journal j ON j.id = e.journal_id
     WHERE e.bank_account_id = ? AND e.posting_date = ? ORDER BY e.id`,
    tillBankAccountId, date,
  );

/** Cash-office documents (float issues, banking, transfers) on this till that are still in flight
 *  — a closing cannot post over them. */
export const tillUnpostedDocuments = (tillBankAccountId: number): Promise<{ no: string; kind: 'TRANSFER'; status: string; amount: Cents }[]> =>
  all(
    `SELECT no, 'TRANSFER' AS kind, status, amount FROM cash_office_transfer
      WHERE (source_bank_account_id = ? OR destination_bank_account_id = ?) AND posted = false AND status IN ('Pending Approval', 'Approved')
     ORDER BY no`,
    tillBankAccountId, tillBankAccountId,
  );

/**
 * The guard every till posting calls (lib/cashManagement.ts): once a
 * closing is posted for a till and a date, nothing may post to that till dated on or before it.
 */
export async function assertTillOpen(bankAccountId: number, valueDate: IsoDate): Promise<void> {
  const closed = await one<{ no: string; closing_date: IsoDate; code: string }>(
    `SELECT c.no, c.closing_date, t.code FROM till_closing c JOIN bank_account t ON t.id = c.till_bank_account_id
     WHERE c.till_bank_account_id = ? AND c.posted = true AND c.closing_date >= ? ORDER BY c.closing_date DESC LIMIT 1`,
    bankAccountId, valueDate,
  );
  if (closed) {
    throw new AppError(`Till ${closed.code} is closed for ${closed.closing_date} (${closed.no}) — nothing can post to it dated on or before that day`, 'TILL_CLOSED');
  }
}

/** The tills a user may close: their own (Cashier Setup), or every till for a treasury user. */
export async function closableTillsForUser(username: string): Promise<{ id: number; code: string; name: string; balance: Cents; own: boolean }[]> {
  const [cashier, treasury] = await Promise.all([cashierSetupForUser(username), treasurySetupForUser(username)]);
  const rows = await all<{ id: number; code: string; name: string; balance: Cents }>(
    "SELECT id, code, name, balance FROM bank_account WHERE account_type = 'TILL' AND status = 'ACTIVE' ORDER BY code",
  );
  const all_ = rows.map((r) => ({ ...r, own: r.id === cashier?.bank_account_id }));
  if (treasury) return all_;
  return all_.filter((r) => r.own);
}

export const listTreasuryAccounts = (): Promise<{ id: number; code: string; name: string }[]> =>
  all("SELECT id, code, name FROM bank_account WHERE account_type = 'TREASURY' AND status = 'ACTIVE' ORDER BY code");

/* ------------------------------------------------------------------ document */

export interface TillClosingInput {
  tillBankAccountId: number;
  closingDate: IsoDate;
  treasuryBankAccountId?: number | null;
  returnToTreasury: boolean;
  varianceReason?: string | null;
}

async function validateHeader(input: TillClosingInput, user: Actor): Promise<{ cashierUsername: string }> {
  if (!input.tillBankAccountId) throw new AppError('A till is required', 'VALIDATION');
  if (!input.closingDate) throw new AppError('A closing date is required', 'VALIDATION');
  if (input.closingDate > today()) throw new AppError('A till cannot be closed for a future date', 'VALIDATION');
  const allowed = await closableTillsForUser(user.username);
  const till = allowed.find((t) => t.id === input.tillBankAccountId);
  if (!till) throw new AppError('That till is not yours to close — only your own till, or any till for a treasury user', 'FORBIDDEN');
  if (input.returnToTreasury && !input.treasuryBankAccountId) throw new AppError('Pick the treasury vault the cash is handed to', 'VALIDATION');
  if (input.treasuryBankAccountId) {
    const v = await one<{ id: number }>("SELECT id FROM bank_account WHERE id = ? AND account_type = 'TREASURY' AND status = 'ACTIVE'", input.treasuryBankAccountId);
    if (!v) throw new AppError('Treasury vault not found or inactive', 'NOT_FOUND');
  }
  const already = await one<{ no: string }>('SELECT no FROM till_closing WHERE till_bank_account_id = ? AND closing_date = ? AND posted = true', input.tillBankAccountId, input.closingDate);
  if (already) throw new AppError(`This till is already closed for ${input.closingDate} (${already.no})`, 'DUPLICATE');
  const owner = await one<{ user_username: string }>("SELECT user_username FROM cashier_setup WHERE bank_account_id = ? AND setup_type = 'CASHIER' LIMIT 1", input.tillBankAccountId);
  return { cashierUsername: owner?.user_username ?? user.username };
}

/** Re-derive the ledger figures and the count, and store them on the document. */
async function refreshFigures(no: string): Promise<TillClosing> {
  const c = await one<TillClosing>('SELECT * FROM till_closing WHERE no = ?', no);
  if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
  const f = await tillDayFigures(c.till_bank_account_id, c.closing_date);
  const counted = await denominationTotal('TILL_CLOSING', no);
  const variance = counted - f.systemBalance;
  const returned = c.return_to_treasury ? counted : 0;
  await run(
    'UPDATE till_closing SET opening_balance = ?, cash_in = ?, cash_out = ?, system_balance = ?, counted_amount = ?, variance = ?, returned_amount = ? WHERE no = ?',
    f.openingBalance, f.cashIn, f.cashOut, f.systemBalance, counted, variance, returned, no,
  );
  return { ...c, ...{ opening_balance: f.openingBalance, cash_in: f.cashIn, cash_out: f.cashOut, system_balance: f.systemBalance, counted_amount: counted, variance, returned_amount: returned } };
}

export async function createTillClosing(input: TillClosingInput, user: Actor): Promise<{ no: string }> {
  const { cashierUsername } = await validateHeader(input, user);
  const open = await one<{ no: string }>("SELECT no FROM till_closing WHERE till_bank_account_id = ? AND closing_date = ? AND posted = false", input.tillBankAccountId, input.closingDate);
  if (open) throw new AppError(`There is already an unposted closing for this till on ${input.closingDate} (${open.no})`, 'DUPLICATE');
  const no = await nextSequence('TILL_CLOSING');
  await run(
    `INSERT INTO till_closing (no, closing_date, till_bank_account_id, cashier_username, treasury_bank_account_id, return_to_treasury, variance_reason, created_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    no, input.closingDate, input.tillBankAccountId, cashierUsername, input.treasuryBankAccountId ?? null, input.returnToTreasury, input.varianceReason?.trim() || null,
    new Date().toISOString(), user.username,
  );
  await refreshFigures(no);
  await audit(user, 'TILL_CLOSING_CREATE', 'till_closing', no, { till: input.tillBankAccountId, date: input.closingDate });
  return { no };
}

async function openDoc(no: string, user: Actor | null): Promise<TillClosing> {
  const c = await one<TillClosing>('SELECT * FROM till_closing WHERE no = ?', no);
  if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
  if (c.status !== 'Open') throw new AppError('Only an open closing can be changed', 'VALIDATION');
  if (user && c.created_by !== user.username) throw new AppError('Only the person who raised this closing can change it', 'NOT_CREATOR');
  return c;
}

export async function updateTillClosing(no: string, input: TillClosingInput, user: Actor): Promise<TillClosingView> {
  const c = await openDoc(no, user);
  if (input.tillBankAccountId !== c.till_bank_account_id || input.closingDate !== c.closing_date) {
    await validateHeader(input, user);
    // A different till or day means a different count — start it afresh.
    await clearDenominationLines('TILL_CLOSING', no);
  }
  await run(
    'UPDATE till_closing SET closing_date = ?, till_bank_account_id = ?, treasury_bank_account_id = ?, return_to_treasury = ?, variance_reason = ? WHERE no = ?',
    input.closingDate, input.tillBankAccountId, input.treasuryBankAccountId ?? null, input.returnToTreasury, input.varianceReason?.trim() || null, no,
  );
  await refreshFigures(no);
  await audit(user, 'TILL_CLOSING_UPDATE', 'till_closing', no, {});
  return (await getTillClosing(no))!;
}

/** The cash count — the denomination grid's save. */
export async function setTillCount(no: string, lines: { denominationId: number; quantity: number }[], user: Actor): Promise<{ counted: Cents; variance: Cents }> {
  await openDoc(no, user);
  await replaceDenominationLines('TILL_CLOSING', no, lines);
  const c = await refreshFigures(no);
  await audit(user, 'TILL_CLOSING_COUNT', 'till_closing', no, { counted: c.counted_amount, variance: c.variance });
  return { counted: c.counted_amount, variance: c.variance };
}

/** Refresh the ledger figures without touching anything else (the card's "Refresh figures"). */
export async function refreshTillClosing(no: string, user: Actor): Promise<TillClosingView> {
  await openDoc(no, null);
  await refreshFigures(no);
  await audit(user, 'TILL_CLOSING_REFRESH', 'till_closing', no, {});
  return (await getTillClosing(no))!;
}

export async function deleteTillClosing(no: string, user: Actor): Promise<void> {
  await openDoc(no, user);
  await clearDenominationLines('TILL_CLOSING', no);
  await run('DELETE FROM till_closing WHERE no = ?', no);
  await audit(user, 'TILL_CLOSING_DELETE', 'till_closing', no, {});
}

async function assertReadyToPost(c: TillClosing): Promise<void> {
  const inFlight = await tillUnpostedDocuments(c.till_bank_account_id);
  if (inFlight.length) {
    throw new AppError(`${inFlight.length} document${inFlight.length === 1 ? ' is' : 's are'} still awaiting posting on this till (${inFlight.slice(0, 3).map((d) => d.no).join(', ')}${inFlight.length > 3 ? '…' : ''}) — post or recall them first`, 'TILL_BUSY');
  }
  if (c.variance !== 0) {
    const org = await getOrg();
    if (c.variance < 0 && !org?.till_shortage_account_id) throw new AppError('The till is short and no Till shortages account is set up (Admin Centre → Setup Pool → Cashiering)', 'VALIDATION');
    if (c.variance > 0 && !org?.till_overage_account_id) throw new AppError('The till is over and no Till overages account is set up (Admin Centre → Setup Pool → Cashiering)', 'VALIDATION');
    if (!c.variance_reason?.trim()) throw new AppError('The count differs from the system balance — a variance reason is required', 'VALIDATION');
  }
  if (c.return_to_treasury && !c.treasury_bank_account_id) throw new AppError('Pick the treasury vault the cash is handed to', 'VALIDATION');
}

export async function submitTillClosing(no: string, user: Actor): Promise<{ autoApproved: boolean }> {
  await openDoc(no, null);
  const c = await refreshFigures(no);
  const hasCount = await one<{ n: number }>("SELECT COUNT(*) AS n FROM cash_denomination_line WHERE document_kind = 'TILL_CLOSING' AND document_no = ?", no);
  if (!Number(hasCount?.n)) throw new AppError('Count the cash first — the denomination breakdown is empty', 'VALIDATION');
  await assertReadyToPost(c);
  const matched = await findMatchingWorkflow('TILL_CLOSING', await pickConditionFields('TILL_CLOSING', c));
  if (!matched) throw new AppError('There is no enabled workflow for this document', 'NO_WORKFLOW');
  await tx(async () => {
    await run("UPDATE till_closing SET status = 'Pending Approval' WHERE no = ?", no);
    await startWorkflow(matched.workflow, matched.steps, { documentType: 'TILL_CLOSING', entityId: no, requestedBy: user.username, amount: Math.abs(Number(c.variance)) });
  });
  const after = await one<{ status: string }>('SELECT status FROM till_closing WHERE no = ?', no);
  return { autoApproved: after?.status === 'Approved' };
}

export async function cancelTillClosingApproval(no: string, user: Actor): Promise<void> {
  const c = await one<Pick<TillClosing, 'status' | 'created_by'>>('SELECT status, created_by FROM till_closing WHERE no = ?', no);
  if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
  if (c.status !== 'Pending Approval') throw new AppError('Only a closing pending approval can be recalled', 'VALIDATION');
  const routed = await findPendingRoutedTask('TILL_CLOSING', no);
  if ((routed?.requested_by ?? c.created_by) !== user.username) throw new AppError('Only the person who submitted this closing can recall it', 'NOT_REQUESTER');
  await run("UPDATE till_closing SET status = 'Open' WHERE no = ?", no);
  await audit(user, 'TILL_CLOSING_CANCEL_APPROVAL', 'till_closing', no, {});
}
export async function approveTillClosing(no: string, user: Actor): Promise<void> {
  const c = await one<TillClosing>('SELECT * FROM till_closing WHERE no = ?', no);
  if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
  if (c.status !== 'Pending Approval') throw new AppError('Only a closing pending approval can be approved', 'VALIDATION');
  await run("UPDATE till_closing SET status = 'Approved', decision_reason = NULL WHERE no = ?", no);
  await audit(user, 'TILL_CLOSING_APPROVE', 'till_closing', no, {});
}
export async function rejectTillClosing(no: string, reason: string | null, user: Actor): Promise<void> {
  if (!reason?.trim()) throw new AppError('A reason is required to reject', 'VALIDATION');
  const c = await one<TillClosing>('SELECT * FROM till_closing WHERE no = ?', no);
  if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
  if (c.status !== 'Pending Approval') throw new AppError('Only a closing pending approval can be rejected', 'VALIDATION');
  await run("UPDATE till_closing SET status = 'Open', decision_reason = ? WHERE no = ?", reason, no);
  await audit(user, 'TILL_CLOSING_REJECT', 'till_closing', no, { reason });
}
export async function reopenTillClosing(no: string, user: Actor): Promise<void> {
  const c = await one<TillClosing>('SELECT * FROM till_closing WHERE no = ?', no);
  if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
  if (c.status !== 'Approved' || c.posted) throw new AppError('Only an approved, unposted closing can be reopened', 'VALIDATION');
  await run("UPDATE till_closing SET status = 'Open' WHERE no = ?", no);
  await audit(user, 'TILL_CLOSING_REOPEN', 'till_closing', no, {});
}

export interface PostTillClosingResult { variance: Cents; varianceJournalNo: string | null; returned: Cents; handoverJournalNo: string | null }

export async function postTillClosing(no: string, user: Actor): Promise<PostTillClosingResult> {
  return tx(async () => {
    const c = await one<TillClosing>('SELECT * FROM till_closing WHERE no = ? FOR UPDATE', no);
    if (!c) throw new AppError('Till closing not found', 'NOT_FOUND');
    if (c.status !== 'Approved') throw new AppError('Only an approved closing can be posted', 'VALIDATION');
    if (c.posted) throw new AppError('This closing has already been posted', 'VALIDATION');
    // The approver signed off on these figures; if the ledger moved since, the count is stale.
    const f = await tillDayFigures(c.till_bank_account_id, c.closing_date);
    if (f.systemBalance !== Number(c.system_balance)) {
      throw new AppError('The till has moved since this closing was approved — reopen it, refresh the figures and recount', 'STALE_FIGURES');
    }
    await assertReadyToPost(c);
    const till = await one<{ gl_account_id: number; code: string; balance: Cents }>('SELECT gl_account_id, code, balance FROM bank_account WHERE id = ? FOR UPDATE', c.till_bank_account_id);
    if (!till) throw new AppError('Till account not found', 'NOT_FOUND');
    if (Number(till.balance) !== f.systemBalance) {
      throw new AppError('Later postings have already landed on this till — close it for the latest day instead', 'STALE_FIGURES');
    }
    const org = await getOrg();
    const variance = Number(c.variance);
    const counted = Number(c.counted_amount);
    let varianceJournalId: number | null = null;
    let varianceJournalNo: string | null = null;
    if (variance !== 0) {
      const short = variance < 0;
      const amt = Math.abs(variance);
      const narration = `${short ? 'Till shortage' : 'Till overage'} ${till.code} — ${c.closing_date} (${no})`;
      const j = await postJournal({
        valueDate: c.closing_date, module: 'CASH', eventType: short ? 'TILL_SHORTAGE' : 'TILL_OVERAGE', description: narration, reference: no,
        user, idempotencyKey: `TILL_CLOSING-${no}-VARIANCE`,
        lines: short
          ? [{ account: org!.till_shortage_account_id!, debit: amt, credit: 0, narration }, { account: till.gl_account_id, debit: 0, credit: amt, narration }]
          : [{ account: till.gl_account_id, debit: amt, credit: 0, narration }, { account: org!.till_overage_account_id!, debit: 0, credit: amt, narration }],
      });
      varianceJournalId = j.id; varianceJournalNo = j.journal_no;
    }
    let handoverJournalId: number | null = null;
    let handoverJournalNo: string | null = null;
    let returned = 0;
    if (c.return_to_treasury && counted > 0) {
      const vault = await one<{ gl_account_id: number; code: string }>('SELECT gl_account_id, code FROM bank_account WHERE id = ?', c.treasury_bank_account_id);
      if (!vault) throw new AppError('Treasury vault not found', 'NOT_FOUND');
      const narration = `End-of-day handover ${till.code} → ${vault.code} — ${c.closing_date} (${no})`;
      const j = await postJournal({
        valueDate: c.closing_date, module: 'CASH', eventType: 'TREASURY_RETURN', description: narration, reference: no,
        user, idempotencyKey: `TILL_CLOSING-${no}-HANDOVER`,
        lines: [
          { account: till.gl_account_id, debit: 0, credit: counted, narration },
          { account: vault.gl_account_id, debit: counted, credit: 0, narration },
        ],
      });
      handoverJournalId = j.id; handoverJournalNo = j.journal_no; returned = counted;
    }
    await run(
      `UPDATE till_closing SET posted = true, posted_at = ?, posted_by = ?, variance_journal_id = ?, handover_journal_id = ?, returned_amount = ? WHERE no = ?`,
      new Date().toISOString(), user.username, varianceJournalId, handoverJournalId, returned, no,
    );
    await audit(user, 'TILL_CLOSING_POST', 'till_closing', no, { variance, varianceJournalNo, returned, handoverJournalNo });
    return { variance, varianceJournalNo, returned, handoverJournalNo };
  });
}

/* ------------------------------------------------------------------ overview */

export interface TillStatusRow { id: number; code: string; name: string; cashier_username: string | null; balance: Cents; last_closed_date: IsoDate | null; last_closing_no: string | null; open_closing_no: string | null; in_flight: number }

/** Every till with its holder, balance now, when it was last closed and whether a closing is in progress — the supervisor's board. */
export const tillStatusBoard = (): Promise<TillStatusRow[]> =>
  all<TillStatusRow>(
    `SELECT b.id, b.code, b.name, ts.user_username AS cashier_username, b.balance,
            lc.closing_date AS last_closed_date, lc.no AS last_closing_no,
            (SELECT no FROM till_closing o WHERE o.till_bank_account_id = b.id AND o.posted = false ORDER BY o.no DESC LIMIT 1) AS open_closing_no,
            (SELECT COUNT(*) FROM cash_office_transfer ft WHERE (ft.source_bank_account_id = b.id OR ft.destination_bank_account_id = b.id) AND ft.posted = false AND ft.status IN ('Pending Approval', 'Approved')) AS in_flight
     FROM bank_account b
     LEFT JOIN cashier_setup ts ON ts.bank_account_id = b.id AND ts.setup_type = 'CASHIER'
     LEFT JOIN LATERAL (SELECT no, closing_date FROM till_closing x WHERE x.till_bank_account_id = b.id AND x.posted = true ORDER BY x.closing_date DESC LIMIT 1) lc ON true
     WHERE b.account_type = 'TILL' AND b.status = 'ACTIVE' ORDER BY b.code`,
  );
