/*
 * Cash Office transfers — float issues, vault drops and banking. One table, five `document_type`
 * flows moving cash between the company's own bank and cash accounts:
 *
 *   RECEIVE_FROM_BANK  Main Bank  -> Treasury vault   (created by a treasury user)
 *   TREASURY_REQUEST   Treasury   -> the cashier's float (created by a cashier)
 *   INTER_TILL         another float -> the cashier's float (created by a cashier)
 *   TREASURY_RETURN    the cashier's float -> Treasury (created by a cashier)
 *   SEND_TO_BANK       Treasury vault -> Main Bank     (created by a treasury user)
 *
 * Maker-checker: Open -> Pending Approval -> Approved -> Processed. Posting is one balanced journal — credit the source bank account's
 * control G/L, debit the destination's — through lib/accounting.ts's postJournal(), which then
 * maintains both bank_account balances and the reconciliation subledger automatically.
 */
import {
  one, all, run, tx, nextSequence, audit, hasAnyRow,
} from './db.ts';
import { AppError } from './errors.ts';
import { postJournal } from './accounting.ts';
import { getJournal, type JournalDetail } from './gl.ts';
import { resolvePostingDate } from './postingDates.ts';
import { assertDenominationsBalance, replaceDenominationLines, clearDenominationLines } from './denominations.ts';
import { cashierSetupForUser, treasurySetupForUser, setupForBankAccount } from './cashierSetup.ts';
import { assertTillOpen } from './tillClosings.ts';
import { findMatchingWorkflow, findPendingRoutedTask, pickConditionFields, startWorkflow } from './workflow.ts';
import { buildFilterClause, type FilterCondition, type FilterFieldDef } from './listFilters.ts';
import { buildOrderClause, type SortState } from './listSort.ts';
import { CASH_TRANSFER_TYPES, cashTransferTypeMeta, type CashTransferTypeMeta } from './constants.ts';
import type {
  Actor, BankAccountType, Cents, CashTransferType, CashTransfer, CashTransferView, IsoDate,
} from './types.ts';

export { CASH_TRANSFER_TYPES, cashTransferTypeMeta };
export type { CashTransferTypeMeta };

export type CashManagementView = 'open' | 'pending' | 'approved' | 'posted';

const VIEW_CLAUSE: Record<CashManagementView, string> = {
  open: "ft.status = 'Open'",
  pending: "ft.status = 'Pending Approval'",
  approved: "ft.status = 'Approved'",
  posted: "ft.status = 'Processed'",
};

const SELECT_ROW = `
  SELECT ft.*,
         sb.code AS source_code, sb.name AS source_name, sb.account_type AS source_account_type,
         sb.balance AS source_balance,
         db.code AS destination_code, db.name AS destination_name, db.account_type AS destination_account_type,
         db.balance AS destination_balance,
         j.journal_no AS journal_no,
         COALESCE((SELECT SUM(cdl.quantity * d.value) FROM cash_denomination_line cdl
                   JOIN denomination d ON d.id = cdl.denomination_id
                   WHERE cdl.document_kind = 'TRANSFER' AND cdl.document_no = ft.no), 0) AS denomination_total
  FROM cash_office_transfer ft
  JOIN bank_account sb ON sb.id = ft.source_bank_account_id
  JOIN bank_account db ON db.id = ft.destination_bank_account_id
  LEFT JOIN journal j ON j.id = ft.journal_id`;

export const CASH_MANAGEMENT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text', column: 'ft.no' },
  {
    key: 'document_type', label: 'Document Type', type: 'select', column: 'ft.document_type',
    options: CASH_TRANSFER_TYPES.map((d) => ({ value: d.value, label: d.label })),
  },
  { key: 'created_by', label: 'Created By', type: 'text', column: 'ft.created_by' },
  { key: 'created_at', label: 'Created', type: 'date', column: 'ft.created_at', datetime: true },
  { key: 'posted_by', label: 'Posted By', type: 'text', column: 'ft.posted_by' },
];

const SORT_COLUMNS: Record<string, string> = {
  no: 'ft.no',
  document_type: 'ft.document_type',
  amount: 'ft.amount',
  status: 'ft.status',
  created_at: 'ft.created_at',
};

export interface ListCashTransfersOptions {
  view?: CashManagementView;
  search?: string;
  filters?: FilterCondition[];
  sort?: SortState | null;
}

export const listCashTransfers = (
  { view, search = '', filters = [], sort = null }: ListCashTransfersOptions = {},
): Promise<CashTransferView[]> => {
  const { clause, params } = buildFilterClause(CASH_MANAGEMENT_FILTER_FIELDS, filters);
  const orderBy = buildOrderClause(SORT_COLUMNS, sort, 'ft.no DESC');
  return all<CashTransferView>(
    `${SELECT_ROW}
     WHERE (ft.no ILIKE @like OR sb.name ILIKE @like OR db.name ILIKE @like OR ft.created_by ILIKE @like)
       ${view ? `AND ${VIEW_CLAUSE[view]}` : ''}
       ${clause}
     ${orderBy}`,
    { like: `%${String(search).trim()}%`, ...params },
  );
};

export const getCashTransfer = (no: string): Promise<CashTransferView | undefined> =>
  one<CashTransferView>(`${SELECT_ROW} WHERE ft.no = ?`, no);

export const hasAnyCashTransfers = (view?: CashManagementView): Promise<boolean> =>
  hasAnyRow('cash_office_transfer ft', view ? VIEW_CLAUSE[view] : undefined);

export async function getAdjacentCashTransferNos(
  no: string, view?: CashManagementView,
): Promise<{ prevNo: string | null; nextNo: string | null }> {
  const clause = view ? `AND ${VIEW_CLAUSE[view]}` : '';
  const [prev, next] = await Promise.all([
    one<{ no: string }>(`SELECT ft.no FROM cash_office_transfer ft WHERE ft.no < ? ${clause} ORDER BY ft.no DESC LIMIT 1`, no),
    one<{ no: string }>(`SELECT ft.no FROM cash_office_transfer ft WHERE ft.no > ? ${clause} ORDER BY ft.no ASC LIMIT 1`, no),
  ]);
  return { prevNo: prev?.no ?? null, nextNo: next?.no ?? null };
};

export const listCashTransferHistory = (no: string): Promise<{ journal_no: string; value_date: IsoDate; description: string | null; amount: Cents }[]> =>
  all(
    'SELECT journal_no, value_date, description, amount FROM journal WHERE reference = ? ORDER BY value_date DESC, id DESC',
    no,
  );

/* ------------------------------------------------------- picklists for the form */

export interface CashAccountBrief {
  id: number;
  code: string;
  name: string;
  account_type: BankAccountType;
  balance: Cents;
  /** From the account's own Cashier Setup (0 when none / no limit). */
  min_capacity: Cents;
  max_capacity: Cents;
}

const ACCOUNT_BRIEF_SELECT = `
  SELECT b.id, b.code, b.name, b.account_type, b.balance,
         COALESCE(ts.min_capacity, 0) AS min_capacity, COALESCE(ts.max_capacity, 0) AS max_capacity
  FROM bank_account b
  LEFT JOIN cashier_setup ts ON ts.bank_account_id = b.id`;

export const listBankAccountsByType = (type: BankAccountType): Promise<CashAccountBrief[]> =>
  all<CashAccountBrief>(
    `${ACCOUNT_BRIEF_SELECT} WHERE b.account_type = ? AND b.status = 'ACTIVE' ORDER BY b.code`,
    type,
  );

/** Other tills — for an INTER_TILL request, every active till except the requester's own. */
export const listOtherTills = (excludeBankAccountId: number): Promise<CashAccountBrief[]> =>
  all<CashAccountBrief>(
    `${ACCOUNT_BRIEF_SELECT} WHERE b.account_type = 'TILL' AND b.status = 'ACTIVE' AND b.id <> ? ORDER BY b.code`,
    excludeBankAccountId,
  );

/* ------------------------------------------------------------------ resolution */

async function autoResolvedAccountId(documentType: CashTransferType, user: Actor): Promise<number> {
  const meta = cashTransferTypeMeta(documentType);
  const setup = meta.creatorSetup === 'CASHIER'
    ? await cashierSetupForUser(user.username)
    : await treasurySetupForUser(user.username);
  if (!setup) {
    throw new AppError(
      meta.creatorSetup === 'CASHIER'
        ? 'You are not set up as a cashier — ask an administrator to add a Cashier Setup for you'
        : 'You are not set up as a vault custodian — ask an administrator to add a Cashier Setup (Treasury) for you',
      'NO_CASHIER_SETUP',
    );
  }
  return setup.bank_account_id;
}

/** The end of a movement that is auto-resolved from the acting user's own Cashier Setup — the
 *  DESTINATION for the three "request" flows, the SOURCE for the two "return" flows. Returned
 *  with its capacity limits so the New form can pre-fill / cap the Amount against the real
 *  ceiling (a return can never take a source below its minimum float, nor push a destination
 *  above its maximum capacity). Null when the user has no matching Cashier Setup. */
export async function myCashAutoAccount(
  documentType: CashTransferType, user: Actor,
): Promise<(CashAccountBrief & { role: 'SOURCE' | 'DESTINATION' }) | null> {
  const meta = cashTransferTypeMeta(documentType);
  const setup = meta.creatorSetup === 'CASHIER'
    ? await cashierSetupForUser(user.username)
    : await treasurySetupForUser(user.username);
  if (!setup) return null;
  const row = await one<CashAccountBrief>(`${ACCOUNT_BRIEF_SELECT} WHERE b.id = ? LIMIT 1`, setup.bank_account_id);
  if (!row) return null;
  return { ...row, role: meta.counterparty === 'SOURCE' ? 'DESTINATION' : 'SOURCE' };
}

async function resolveEnds(
  documentType: CashTransferType, counterpartyBankAccountId: number, user: Actor,
): Promise<{ sourceId: number; destinationId: number }> {
  const meta = cashTransferTypeMeta(documentType);
  const mine = await autoResolvedAccountId(documentType, user);

  const cp = await one<{ account_type: BankAccountType }>(
    'SELECT account_type FROM bank_account WHERE id = ?', counterpartyBankAccountId,
  );
  if (!cp) throw new AppError('The selected account was not found', 'NOT_FOUND');
  if (cp.account_type !== meta.counterpartyType) {
    throw new AppError(`The selected account must be a ${meta.counterpartyType} account`, 'VALIDATION');
  }
  if (counterpartyBankAccountId === mine) {
    throw new AppError('The source and destination cannot be the same account', 'VALIDATION');
  }
  return meta.counterparty === 'SOURCE'
    ? { sourceId: counterpartyBankAccountId, destinationId: mine }
    : { sourceId: mine, destinationId: counterpartyBankAccountId };
}

/* ----------------------------------------------------------------- capacity */

/** Capacity guard — a destination that has a Cashier Setup with a Maximum Capacity may
 *  not be pushed above it; a source with a Minimum Capacity may not be pulled below it. */
async function assertCapacity(sourceId: number, destinationId: number, amount: Cents): Promise<void> {
  const [source, dest, srcSetup, dstSetup] = await Promise.all([
    one<{ balance: Cents; name: string; account_type: BankAccountType }>('SELECT balance, name, account_type FROM bank_account WHERE id = ?', sourceId),
    one<{ balance: Cents; name: string; account_type: BankAccountType }>('SELECT balance, name, account_type FROM bank_account WHERE id = ?', destinationId),
    setupForBankAccount(sourceId),
    setupForBankAccount(destinationId),
  ]);
  if (dstSetup && dstSetup.max_capacity > 0 && dest && dest.balance + amount > dstSetup.max_capacity) {
    throw new AppError(
      `This would take ${dest.name} to ${((dest.balance + amount) / 100).toFixed(2)}, above its maximum capacity of ${(dstSetup.max_capacity / 100).toFixed(2)}`,
      'OVER_CAPACITY',
    );
  }
  if (srcSetup && srcSetup.min_capacity > 0 && source && source.balance - amount < srcSetup.min_capacity) {
    throw new AppError(
      `This would take ${source.name} to ${((source.balance - amount) / 100).toFixed(2)}, below its minimum capacity of ${(srcSetup.min_capacity / 100).toFixed(2)}`,
      'UNDER_CAPACITY',
    );
  }
  // The external Main Bank isn't a cash drawer we track to the shilling, so a
  // Receive From Bank is not gated on its recorded balance (AL does the same).
  if (source && source.account_type !== 'MAIN' && source.balance - amount < 0) {
    throw new AppError(
      `${source.name} only holds ${(source.balance / 100).toFixed(2)} — you cannot move out ${(amount / 100).toFixed(2)}`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

/* ------------------------------------------------------------------- create */

export interface CashTransferInput {
  documentType: CashTransferType;
  counterpartyBankAccountId: number;
  amount: Cents;
}

function assertAmount(amount: Cents): void {
  if (!(amount > 0)) throw new AppError('Amount must be greater than zero', 'VALIDATION');
}

/** AL Tab52204044.OnInsert — one open document of a type at a time per user (Receive/Send to
 *  Bank only block on an unposted one). */
async function assertNoOpenDocument(documentType: CashTransferType, user: Actor): Promise<void> {
  const existing = await one<{ no: string }>(
    `SELECT no FROM cash_office_transfer
     WHERE created_by = ? AND document_type = ? AND status <> 'Processed'
     ORDER BY no DESC LIMIT 1`,
    user.username, documentType,
  );
  if (existing) {
    throw new AppError(
      `You already have an open ${cashTransferTypeMeta(documentType).label} document (${existing.no}) — finish or delete it first`,
      'OPEN_DOCUMENT_EXISTS',
    );
  }
}

async function seedDenominationGrid(no: string): Promise<void> {
  // Nothing to seed — getDenominationLines() already left-joins the active master, so an
  // untouched grid renders with every denomination at quantity 0. Kept as a hook.
  void no;
}

export async function createCashTransfer(input: CashTransferInput, user: Actor): Promise<{ no: string }> {
  assertAmount(input.amount);
  await assertNoOpenDocument(input.documentType, user);
  const { sourceId, destinationId } = await resolveEnds(input.documentType, input.counterpartyBankAccountId, user);
  await assertCapacity(sourceId, destinationId, input.amount);

  const no = await nextSequence('CASH_OFFICE_TRANSFER');
  await run(
    `INSERT INTO cash_office_transfer
       (no, document_type, source_bank_account_id, destination_bank_account_id, amount, created_at, created_by)
     VALUES (?,?,?,?,?,?,?)`,
    no, input.documentType, sourceId, destinationId, Math.round(input.amount),
    new Date().toISOString(), user.username,
  );
  await seedDenominationGrid(no);
  await audit(user, 'CASH_OFFICE_TRANSFER_CREATE', 'cash_office_transfer', no, { documentType: input.documentType });
  return { no };
}

export async function updateCashTransfer(
  no: string, input: CashTransferInput, user: Actor,
): Promise<CashTransferView> {
  const before = await one<CashTransfer>('SELECT * FROM cash_office_transfer WHERE no = ?', no);
  if (!before) throw new AppError('Document not found', 'NOT_FOUND');
  if (before.status !== 'Open') throw new AppError('Only an open document can be edited', 'VALIDATION');
  if (before.created_by !== user.username) throw new AppError('Only the person who created this document can edit it', 'NOT_CREATOR');
  if (input.documentType !== before.document_type) throw new AppError('The document type cannot be changed', 'VALIDATION');
  assertAmount(input.amount);
  const { sourceId, destinationId } = await resolveEnds(input.documentType, input.counterpartyBankAccountId, user);
  await assertCapacity(sourceId, destinationId, input.amount);

  await run(
    'UPDATE cash_office_transfer SET source_bank_account_id = ?, destination_bank_account_id = ?, amount = ? WHERE no = ?',
    sourceId, destinationId, Math.round(input.amount), no,
  );
  await audit(user, 'CASH_OFFICE_TRANSFER_UPDATE', 'cash_office_transfer', no, {});
  return (await getCashTransfer(no))!;
}

export async function setCashTransferDenominations(
  no: string, lines: { denominationId: number; quantity: number }[], user: Actor,
): Promise<void> {
  const doc = await one<Pick<CashTransfer, 'status' | 'created_by'>>(
    'SELECT status, created_by FROM cash_office_transfer WHERE no = ?', no,
  );
  if (!doc) throw new AppError('Document not found', 'NOT_FOUND');
  if (doc.status !== 'Open') throw new AppError('The denomination breakdown can only be changed while the document is open', 'VALIDATION');
  if (doc.created_by !== user.username) throw new AppError('Only the person who created this document can edit it', 'NOT_CREATOR');
  await replaceDenominationLines('TRANSFER', no, lines);
}

export async function deleteCashTransfer(no: string, user: Actor): Promise<void> {
  const before = await one<Pick<CashTransfer, 'status' | 'created_by'>>(
    'SELECT status, created_by FROM cash_office_transfer WHERE no = ?', no,
  );
  if (!before) throw new AppError('Document not found', 'NOT_FOUND');
  if (before.status !== 'Open') throw new AppError('Only an open document can be deleted', 'VALIDATION');
  if (before.created_by !== user.username) throw new AppError('Only the person who created this document can delete it', 'NOT_CREATOR');
  await clearDenominationLines('TRANSFER', no);
  await run('DELETE FROM cash_office_transfer WHERE no = ?', no);
  await audit(user, 'CASH_OFFICE_TRANSFER_DELETE', 'cash_office_transfer', no, {});
}

/* -------------------------------------------------------------- maker-checker */

export async function submitCashTransfer(no: string, user: Actor): Promise<{ autoApproved: boolean }> {
  const req = await one<CashTransfer>('SELECT * FROM cash_office_transfer WHERE no = ?', no);
  if (!req) throw new AppError('Document not found', 'NOT_FOUND');
  if (req.status !== 'Open') throw new AppError('Only an open document can be submitted for approval', 'VALIDATION');
  assertAmount(req.amount);
  await assertCapacity(req.source_bank_account_id, req.destination_bank_account_id, req.amount);
  await assertDenominationsBalance('TRANSFER', no, req.amount);

  const matched = await findMatchingWorkflow('CASH_OFFICE_TRANSFER', await pickConditionFields('CASH_OFFICE_TRANSFER', req));
  if (!matched) throw new AppError('There is no enabled workflow for this document', 'NO_WORKFLOW');

  await tx(async () => {
    await run("UPDATE cash_office_transfer SET status = 'Pending Approval' WHERE no = ?", no);
    await startWorkflow(matched.workflow, matched.steps, {
      documentType: 'CASH_OFFICE_TRANSFER', entityId: no, requestedBy: user.username, amount: Number(req.amount),
    });
  });

  const after = await one<{ status: string }>('SELECT status FROM cash_office_transfer WHERE no = ?', no);
  return { autoApproved: after?.status === 'Approved' };
}

export async function cancelCashTransferApproval(no: string, user: Actor): Promise<void> {
  const req = await one<Pick<CashTransfer, 'status' | 'created_by'>>(
    'SELECT status, created_by FROM cash_office_transfer WHERE no = ?', no,
  );
  if (!req) throw new AppError('Document not found', 'NOT_FOUND');
  if (req.status !== 'Pending Approval') throw new AppError('Only a document pending approval can be recalled', 'VALIDATION');
  const routed = await findPendingRoutedTask('CASH_OFFICE_TRANSFER', no);
  const requestedBy = routed?.requested_by ?? req.created_by;
  if (requestedBy !== user.username) throw new AppError('Only the person who submitted this document can recall it', 'NOT_REQUESTER');
  await run("UPDATE cash_office_transfer SET status = 'Open' WHERE no = ?", no);
  await audit(user, 'CASH_OFFICE_TRANSFER_CANCEL_APPROVAL', 'cash_office_transfer', no, {});
}

export async function approveCashTransfer(no: string, user: Actor): Promise<void> {
  const req = await one<CashTransfer>('SELECT * FROM cash_office_transfer WHERE no = ?', no);
  if (!req) throw new AppError('Document not found', 'NOT_FOUND');
  if (req.status !== 'Pending Approval') throw new AppError('Only a document pending approval can be approved', 'VALIDATION');
  await run("UPDATE cash_office_transfer SET status = 'Approved', decision_reason = NULL WHERE no = ?", no);
  await audit(user, 'CASH_OFFICE_TRANSFER_APPROVE', 'cash_office_transfer', no, {});
}

export async function rejectCashTransfer(no: string, reason: string | null, user: Actor): Promise<void> {
  if (!reason || !reason.trim()) throw new AppError('A reason is required to reject a document', 'VALIDATION');
  const req = await one<CashTransfer>('SELECT * FROM cash_office_transfer WHERE no = ?', no);
  if (!req) throw new AppError('Document not found', 'NOT_FOUND');
  if (req.status !== 'Pending Approval') throw new AppError('Only a document pending approval can be rejected', 'VALIDATION');
  await run("UPDATE cash_office_transfer SET status = 'Open', decision_reason = ? WHERE no = ?", reason, no);
  await audit(user, 'CASH_OFFICE_TRANSFER_REJECT', 'cash_office_transfer', no, { reason });
}

/* ------------------------------------------------------------------- posting */

const POSTING_NARRATION: Record<CashTransferType, string> = {
  RECEIVE_FROM_BANK: 'Receive cash from Main Bank',
  TREASURY_REQUEST: 'Issue till cash from Treasury',
  INTER_TILL: 'Inter-till cash transfer',
  TREASURY_RETURN: 'Return till cash to Treasury',
  SEND_TO_BANK: 'Return cash to Main Bank',
};

/**
 * Posting a transfer — one balanced journal: credit the source bank
 * account's control G/L, debit the destination's, for the full amount. postJournal() maintains
 * both bank_account balances and their reconciliation subledger entries. The capacity guard is
 * re-run here, since balances may have moved since approval.
 */
export async function processCashTransfer(no: string, user: Actor): Promise<{ journalNo: string; amount: Cents }> {
  return tx(async () => {
    const req = await one<CashTransfer>('SELECT * FROM cash_office_transfer WHERE no = ?', no);
    if (!req) throw new AppError('Document not found', 'NOT_FOUND');
    if (req.status !== 'Approved') throw new AppError('Only an approved document can be posted', 'VALIDATION');
    if (req.posted) throw new AppError('This document has already been posted', 'VALIDATION');
    await assertCapacity(req.source_bank_account_id, req.destination_bank_account_id, req.amount);
    await assertDenominationsBalance('TRANSFER', no, req.amount);

    const [source, destination] = await Promise.all([
      one<{ gl_account_id: number }>('SELECT gl_account_id FROM bank_account WHERE id = ?', req.source_bank_account_id),
      one<{ gl_account_id: number }>('SELECT gl_account_id FROM bank_account WHERE id = ?', req.destination_bank_account_id),
    ]);
    if (!source || !destination) throw new AppError('A bank account on this document no longer exists', 'NOT_FOUND');

    const vd = await resolvePostingDate(user);
    // A till that has been closed for the day (lib/tillClosings.ts) takes no more cash either way.
    await Promise.all([assertTillOpen(req.source_bank_account_id, vd), assertTillOpen(req.destination_bank_account_id, vd)]);
    const narration = `${POSTING_NARRATION[req.document_type]} — ${no}`;
    const j = await postJournal({
      valueDate: vd, module: 'CASH', eventType: req.document_type, description: narration, reference: no,
      globalDimension1Id: req.global_dimension_1_id, globalDimension2Id: req.global_dimension_2_id,
      user, idempotencyKey: `CASH_OFFICE_TRANSFER-${no}`,
      lines: [
        { account: source.gl_account_id, debit: 0, credit: Number(req.amount), narration },
        { account: destination.gl_account_id, debit: Number(req.amount), credit: 0, narration },
      ],
    });

    await run(
      `UPDATE cash_office_transfer SET status = 'Processed', posted = true, journal_id = ?, posted_at = ?, posted_by = ?
       WHERE no = ?`,
      j.id, new Date().toISOString(), user.username, no,
    );
    await audit(user, 'CASH_OFFICE_TRANSFER_POST', 'cash_office_transfer', no, { journalNo: j.journal_no });
    return { journalNo: j.journal_no, amount: Number(req.amount) };
  });
}

export async function getCashTransferJournal(no: string): Promise<JournalDetail | null> {
  const row = await one<{ journal_id: number | null }>('SELECT journal_id FROM cash_office_transfer WHERE no = ?', no);
  if (!row?.journal_id) return null;
  return getJournal(row.journal_id);
}
