/*
 * Insurance claims and pre-authorisations.
 *
 * A finalised bill's scheme share becomes a DRAFT claim (lib/clinic/billing.ts). The claims desk
 * batches and SUBMITS it to the payer, then records the payer's decision:
 *
 *   - APPROVED / PARTIAL: a sales invoice for the approved amount is raised to the payer's own
 *     Receivables customer and posted — Dr Trade Debtors / Cr Unbilled Insurance Claims — so the
 *     claim ages, is statemented, reminded and receipted like any debtor.
 *   - REJECTED / the shortfall on a PARTIAL: written off — Dr Claim Rejections / Cr Unbilled Claims.
 *
 * Whether the payer has paid is read from the invoice's remaining amount in the customer ledger.
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, money, pick, nowIso, todayIso, q as qText } from '../input.ts';
import { postJournal } from '../accounting.ts';
import { createSalesDocument, setSalesLines, postSalesDocument } from '../salesDocuments.ts';
import { getClinicSetup } from './setup.ts';
import { notify } from '../notifications.ts';
import type { Actor, InsuranceClaim, Preauthorization } from '../types.ts';

const CLAIM_SELECT = `
  SELECT c.*, s.name AS scheme_name, s.code AS scheme_code, trim(p.first_name || ' ' || p.last_name) AS patient_name, p.mrn,
         v.no AS visit_no, v.visit_date, b.no AS bill_no, (current_date - c.claim_date::date)::int AS age_days,
         COALESCE((SELECT cle.amount - cle.remaining_amount FROM cust_ledger_entry cle WHERE cle.document_no = c.invoice_no AND cle.customer_id = s.customer_id LIMIT 1), 0) AS paid_amount
  FROM insurance_claim c JOIN insurance_scheme s ON s.id = c.scheme_id JOIN patient p ON p.id = c.patient_id
  JOIN visit v ON v.id = c.visit_id JOIN patient_bill b ON b.id = c.bill_id`;

export type ClaimView = 'draft' | 'submitted' | 'decided' | 'all';

export async function listClaims(view: ClaimView, q = '', schemeId?: number | null): Promise<InsuranceClaim[]> {
  const where = view === 'draft' ? "c.status = 'DRAFT'" : view === 'submitted' ? "c.status = 'SUBMITTED'" : view === 'decided' ? "c.status IN ('APPROVED','PARTIAL','REJECTED')" : 'TRUE';
  return all<InsuranceClaim>(
    `${CLAIM_SELECT} WHERE ${where} AND (@scheme = 0 OR c.scheme_id = @scheme)
       AND (@q = '' OR c.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR c.member_no ILIKE '%' || @q || '%' OR p.last_name ILIKE '%' || @q || '%' OR c.batch_ref ILIKE '%' || @q || '%')
     ORDER BY c.claim_date ${view === 'decided' ? 'DESC' : 'ASC'}, c.id LIMIT 1000`, { q: qText(q), scheme: schemeId ?? 0 },
  );
}

export const getClaim = (no: string): Promise<InsuranceClaim | undefined> => one<InsuranceClaim>(`${CLAIM_SELECT} WHERE c.no = @no`, { no });

/** Outstanding by payer: drafts not sent, sent but undecided, approved but unpaid. */
export const claimsByScheme = () => all<{ scheme_id: number; scheme_name: string; draft: number; submitted: number; approved_unpaid: number; overdue: number }>(
  `SELECT s.id AS scheme_id, s.name AS scheme_name,
          COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'DRAFT'), 0) AS draft,
          COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'SUBMITTED'), 0) AS submitted,
          COALESCE(SUM(cle.remaining_amount) FILTER (WHERE c.status IN ('APPROVED','PARTIAL')), 0) AS approved_unpaid,
          COUNT(*) FILTER (WHERE c.status = 'DRAFT' AND (current_date - c.claim_date::date) > s.claim_submission_days)::int AS overdue
   FROM insurance_scheme s LEFT JOIN insurance_claim c ON c.scheme_id = s.id
   LEFT JOIN cust_ledger_entry cle ON cle.document_no = c.invoice_no AND cle.customer_id = s.customer_id
   GROUP BY s.id, s.name HAVING COUNT(c.id) > 0 ORDER BY s.name`,
);

export async function claimCharges(claimId: number) {
  return all<{ description: string; quantity: number; amount: number; discount: number; scheme_amount: number; service_code: string | null; charged_at: string }>(
    `SELECT ch.description, ch.quantity::float AS quantity, ch.amount, ch.discount, ch.scheme_amount, s.code AS service_code, ch.charged_at
     FROM patient_charge ch JOIN insurance_claim c ON c.bill_id = ch.bill_id LEFT JOIN service_item s ON s.id = ch.service_item_id
     WHERE c.id = ? AND ch.status = 'BILLED' ORDER BY ch.id`, claimId,
  );
}

/** Submits draft claims to the payer under one batch reference (the payer's covering letter). */
export async function submitClaims(nos: string[], batchRaw: unknown, user: Actor): Promise<{ submitted: number; batch: string }> {
  if (!nos.length) throw new AppError('Pick the claims to submit', 'VALIDATION');
  const batch = text(batchRaw, 'Batch reference', { max: 40 }) ?? `B${todayIso().replace(/-/g, '')}-${user.username.toUpperCase()}`;
  let n = 0;
  await tx(async () => {
    for (const no of nos.slice(0, 500)) {
      const r = await run("UPDATE insurance_claim SET status = 'SUBMITTED', batch_ref = ?, submitted_at = ?, submitted_by = ? WHERE no = ? AND status = 'DRAFT'", batch, nowIso(), user.username, no);
      n += r.changes;
    }
  });
  if (!n) throw new AppError('None of those claims is a draft', 'VALIDATION');
  await audit(user, 'CLAIMS_SUBMIT', 'insurance_claim', batch, { claims: n });
  return { submitted: n, batch };
}

/** Records the payer's decision; approving invoices the payer, the rest is written off. */
export async function decideClaim(no: string, v: Record<string, unknown>, user: Actor): Promise<{ invoiceNo: string | null }> {
  const decision = pick(v.decision, ['APPROVED', 'PARTIAL', 'REJECTED'] as const, 'Decision');
  const r = await tx(async () => {
    const c = await one<InsuranceClaim & { customer_id: number | null }>(
      'SELECT c.*, s.customer_id FROM insurance_claim c JOIN insurance_scheme s ON s.id = c.scheme_id WHERE c.no = ?', no);
    if (!c) throw new AppError('Claim not found', 'NOT_FOUND');
    if (c.status !== 'SUBMITTED' && c.status !== 'DRAFT') throw new AppError('This claim has already been decided', 'VALIDATION');
    const amount = Number(c.amount);
    const approved = decision === 'APPROVED' ? amount : decision === 'REJECTED' ? 0 : money(v.approved_amount, 'Approved amount', { positive: true });
    if (approved > amount) throw new AppError('The approved amount cannot exceed the claim', 'VALIDATION');
    if (decision === 'PARTIAL' && approved === amount) throw new AppError('That is the full amount — record it as Approved', 'VALIDATION');
    const reason = decision === 'APPROVED' ? null : req(v.rejection_reason, 'Reason given by the payer', 500);
    const setup = await getClinicSetup();
    const unbilled = (await one<{ code: string }>('SELECT code FROM gl_account WHERE id = ?', setup.unbilled_claims_account_id))?.code;
    if (!unbilled || !setup.claim_writeoff_account_id) throw new AppError('Clinic Setup is missing the unbilled claims or claim write-off account', 'VALIDATION');
    const today = todayIso();

    let invoiceNo: string | null = null;
    if (approved > 0) {
      if (!c.customer_id) throw new AppError('The payer has no Receivables customer', 'VALIDATION');
      const { no: docNo } = await createSalesDocument({
        documentType: 'Invoice', customerId: c.customer_id, postingDate: today, documentDate: today, yourReference: `${c.no} · ${c.member_no ?? ''}`.trim(),
      }, user);
      await setSalesLines(docNo, [{
        type: 'G/L Account', no: unbilled, description: `Claim ${c.no} — member ${c.member_no ?? '—'}`, quantity: 1, unitPrice: approved, vatProdPostingGroupCode: 'EXEMPT',
      }], user);
      const cust = (await one<{ name: string; address: string | null; city: string | null; contact: string | null }>('SELECT name, address, city, contact FROM customer WHERE id = ?', c.customer_id))!;
      await run("UPDATE sales_header SET status = 'Released', sell_to_name = ?, sell_to_address = ?, sell_to_city = ?, sell_to_contact = ? WHERE no = ?",
        cust.name, cust.address, cust.city, cust.contact, docNo);
      invoiceNo = (await postSalesDocument(docNo, { invoice: true }, user)).invoiceNo;
    }
    let writeoffId: number | null = null;
    if (approved < amount) {
      const j = await postJournal({
        valueDate: today, module: 'CLINIC', eventType: 'CLAIM_WRITE_OFF', reference: c.no, user, idempotencyKey: `CLAIM-WO-${c.no}`,
        description: `Claim ${c.no} ${decision === 'REJECTED' ? 'rejected' : 'short-paid'}: ${reason}`,
        lines: [
          { account: setup.claim_writeoff_account_id, debit: amount - approved, credit: 0, narration: `Claim ${c.no}` },
          { account: setup.unbilled_claims_account_id!, debit: 0, credit: amount - approved, narration: `Claim ${c.no}` },
        ],
      });
      writeoffId = j.id;
    }
    await run(`UPDATE insurance_claim SET status = ?, approved_amount = ?, decided_at = ?, decided_by = ?, rejection_reason = ?, invoice_no = ?, writeoff_journal_id = ?,
               submitted_at = COALESCE(submitted_at, ?), submitted_by = COALESCE(submitted_by, ?) WHERE id = ?`,
    decision, approved, nowIso(), user.username, reason, invoiceNo, writeoffId, nowIso(), user.username, c.id);
    return { invoiceNo, createdBy: c.created_by };
  });
  await audit(user, 'CLAIM_DECIDE', 'insurance_claim', no, { decision, invoice: r.invoiceNo });
  const creator = await one<{ id: number }>('SELECT id FROM app_user WHERE username = ?', r.createdBy);
  if (creator && r.createdBy !== user.username) await notify(creator.id, 'CLAIM_DECIDED', `Claim ${no} ${decision.toLowerCase()}`, null, `/claims/view/${no}`);
  return { invoiceNo: r.invoiceNo };
}

/* ------------------------------------------------------------------ pre-authorisation */

const PREAUTH_SELECT = `
  SELECT pa.*, s.name AS scheme_name, trim(p.first_name || ' ' || p.last_name) AS patient_name, p.mrn, v.no AS visit_no
  FROM preauthorization pa JOIN insurance_scheme s ON s.id = pa.scheme_id JOIN patient p ON p.id = pa.patient_id LEFT JOIN visit v ON v.id = pa.visit_id`;

export const listPreauths = (status: 'REQUESTED' | 'DECIDED'): Promise<Preauthorization[]> => all<Preauthorization>(
  `${PREAUTH_SELECT} WHERE ${status === 'REQUESTED' ? "pa.status = 'REQUESTED'" : "pa.status <> 'REQUESTED' AND substr(pa.decided_at,1,10) >= to_char(current_date - 60, 'YYYY-MM-DD')"}
   ORDER BY pa.requested_at DESC LIMIT 300`,
);
export const listVisitPreauths = (visitId: number): Promise<Preauthorization[]> => all<Preauthorization>(`${PREAUTH_SELECT} WHERE pa.visit_id = @v ORDER BY pa.id`, { v: visitId });

export async function requestPreauth(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  const visit = await one<{ id: number; patient_id: number; scheme_id: number | null; status: string }>('SELECT id, patient_id, scheme_id, status FROM visit WHERE no = ?', visitNo);
  if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
  if (!visit.scheme_id) throw new AppError('This is a cash visit — there is no payer to pre-authorise with', 'VALIDATION');
  const no = await nextSequence('PREAUTH');
  await run(`INSERT INTO preauthorization (no, scheme_id, patient_id, visit_id, requested_amount, description, requested_at, requested_by, notes)
             VALUES (?,?,?,?,?,?,?,?,?)`, no, visit.scheme_id, visit.patient_id, visit.id, money(v.requested_amount, 'Amount', { positive: true }),
  req(v.description, 'What is being authorised', 300), nowIso(), user.username, text(v.notes, 'Notes', { max: 1000 }));
  await audit(user, 'PREAUTH_REQUEST', 'preauthorization', no, { visit: visitNo });
  return { no };
}

export async function decidePreauth(no: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const decision = pick(v.decision, ['APPROVED', 'DECLINED'] as const, 'Decision');
  const pa = await one<{ id: number; status: string; requested_amount: number }>('SELECT id, status, requested_amount FROM preauthorization WHERE no = ?', no);
  if (!pa) throw new AppError('Pre-authorisation not found', 'NOT_FOUND');
  if (pa.status !== 'REQUESTED') throw new AppError('Already decided', 'VALIDATION');
  const approved = decision === 'APPROVED' ? (String(v.approved_amount ?? '').trim() ? money(v.approved_amount, 'Approved amount') : Number(pa.requested_amount)) : null;
  await run('UPDATE preauthorization SET status = ?, approved_amount = ?, auth_code = ?, decided_at = ?, decided_by = ?, notes = COALESCE(?, notes) WHERE id = ?',
    decision, approved, decision === 'APPROVED' ? req(v.auth_code, 'Authorisation code', 40) : null, nowIso(), user.username, text(v.notes, 'Notes', { max: 1000 }), pa.id);
  await audit(user, 'PREAUTH_DECIDE', 'preauthorization', no, { decision });
}

