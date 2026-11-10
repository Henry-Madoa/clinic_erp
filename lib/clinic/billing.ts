/*
 * Patient billing — the visit's folio, the bill, and the cashier.
 *
 * Every service a visit incurs is a patient_charge, priced on the visit's price list (Cash, or the
 * scheme's tariff) the moment it is raised. Charges stay OPEN until the bill is finalised.
 *
 * The split. On a scheme visit the payer covers each line less the member's co-pay (a percentage
 * of every line, or a fixed amount per visit), up to the scheme's per-visit limit; whatever is left
 * is the patient's share. On a cash visit the patient pays everything.
 *
 * How the money moves (one engine — lib/accounting.ts postJournal):
 *   - Cashier receipt:  Dr the till / M-Pesa / card / bank account  Cr Patient Receivables
 *     (a receipt before the bill is final simply sits as a credit — a deposit — on that account).
 *   - Finalise bill:    Dr Patient Receivables (patient share)
 *                       Dr Unbilled Insurance Claims (scheme share)
 *                       Dr Discounts Allowed (discounts and waivers)
 *                       Cr the revenue account of each line's category (gross)
 *     and the scheme share becomes a DRAFT insurance claim (lib/clinic/claims.ts).
 *   - Void a receipt:   the exact reverse of its journal; the receipt row is kept, marked VOIDED.
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, num, money, pick, optId, nowIso, todayIso } from '../input.ts';
import { postJournal } from '../accounting.ts';
import { getClinicSetup, priceFor } from './setup.ts';
import type { Actor, Cents, ChargeSource, PatientBill, PatientCharge, PatientPayment, PatientPaymentMethod, VisitAccount } from '../types.ts';

export const PAYMENT_METHODS: PatientPaymentMethod[] = ['CASH', 'MPESA', 'CARD', 'BANK'];

interface VisitForBilling {
  id: number; no: string; patient_id: number; status: string; payment_mode: string; scheme_id: number | null; price_list_code: string;
  department_code: string; copay_type: string | null; copay_value: number | null; visit_limit: number | null;
}

async function visitForBilling(visitId: number): Promise<VisitForBilling> {
  const v = await one<VisitForBilling>(
    `SELECT v.id, v.no, v.patient_id, v.status, v.payment_mode, v.scheme_id, v.price_list_code, v.department_code,
            s.copay_type, s.copay_value, s.visit_limit
     FROM visit v LEFT JOIN insurance_scheme s ON s.id = v.scheme_id WHERE v.id = ?`, visitId,
  );
  if (!v) throw new AppError('Visit not found', 'NOT_FOUND');
  return v;
}

async function assertBillOpen(visitId: number): Promise<void> {
  if (await one("SELECT 1 FROM patient_bill WHERE visit_id = ? AND status = 'FINAL'", visitId)) {
    throw new AppError('The bill for this visit is final — no more charges can be added or changed', 'VALIDATION');
  }
}

/* ------------------------------------------------------------------ charges */

interface ChargeInput {
  serviceItemId: number;
  quantity?: number;
  sourceType: ChargeSource;
  sourceId?: number | null;
  description?: string | null;
  /** Overrides the tariff (dental fees agreed on a plan, a manual charge). */
  unitPrice?: Cents | null;
}

/** Raises one charge on an open visit, priced on the visit's price list. Returns the charge id. */
export async function addCharge(visitId: number, input: ChargeInput, user: Actor): Promise<number> {
  const v = await visitForBilling(visitId);
  if (v.status === 'CANCELLED') throw new AppError('The visit was cancelled', 'VALIDATION');
  await assertBillOpen(visitId);
  const svc = await one<{ id: number; name: string; department_code: string | null; status: string }>(
    'SELECT id, name, department_code, status FROM service_item WHERE id = ?', input.serviceItemId);
  if (!svc) throw new AppError('Service not found', 'NOT_FOUND');
  if (svc.status !== 'ACTIVE') throw new AppError(`${svc.name} is no longer offered`, 'VALIDATION');
  const qty = input.quantity ?? 1;
  if (!(qty > 0) || qty > 10000) throw new AppError('Quantity must be more than zero', 'VALIDATION');
  const unit = input.unitPrice ?? (await priceFor(svc.id, v.price_list_code));
  const info = await run(
    `INSERT INTO patient_charge (visit_id, patient_id, service_item_id, source_type, source_id, department_code, description, quantity, unit_price, amount, charged_at, charged_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    visitId, v.patient_id, svc.id, input.sourceType, input.sourceId ?? null, svc.department_code ?? v.department_code,
    input.description?.trim() || svc.name, qty, unit, Math.round(unit * qty), nowIso(), user.username,
  );
  return info.lastInsertRowid;
}

/** A charge added by hand at the counter (a consumable, a service not ordered through a screen). */
export async function addManualCharge(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const visit = await one<{ id: number }>('SELECT id FROM visit WHERE no = ?', visitNo);
  if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
  const svcId = optId(v.service_item_id, 'Service');
  if (!svcId) throw new AppError('Pick the service', 'VALIDATION');
  const qty = num(v.quantity || 1, 'Quantity', 0.01, 10000);
  const id = await addCharge(visit.id, { serviceItemId: svcId, quantity: qty, sourceType: 'MANUAL', description: text(v.description, 'Description', { max: 200 }) }, user);
  await audit(user, 'CHARGE_ADD', 'patient_charge', id, { visit: visitNo });
}

export const listCharges = (visitId: number, includeCancelled = true): Promise<PatientCharge[]> => all<PatientCharge>(
  `SELECT c.*, c.quantity::float AS quantity, s.code AS service_code, s.category_code FROM patient_charge c LEFT JOIN service_item s ON s.id = c.service_item_id
   WHERE c.visit_id = ? AND (? = 1 OR c.status <> 'CANCELLED') ORDER BY c.id`, visitId, includeCancelled ? 1 : 0,
);

/** Cancels an unbilled charge — and the order it came from when no work has been done on it yet. */
export async function cancelCharge(chargeId: number, reasonRaw: unknown, user: Actor): Promise<void> {
  const reason = req(reasonRaw, 'Reason', 300);
  await tx(async () => {
    const c = await one<PatientCharge>('SELECT * FROM patient_charge WHERE id = ?', chargeId);
    if (!c) throw new AppError('Charge not found', 'NOT_FOUND');
    if (c.status !== 'OPEN') throw new AppError('Only an unbilled charge can be cancelled', 'VALIDATION');
    await assertBillOpen(c.visit_id);
    if (c.source_type === 'LAB' && c.source_id) {
      const t = await one<{ status: string }>('SELECT status FROM lab_order_test WHERE id = ?', c.source_id);
      if (t && t.status !== 'ORDERED') throw new AppError('The sample has already been taken — the test cannot be cancelled from the bill', 'VALIDATION');
      await run("UPDATE lab_order_test SET status = 'CANCELLED', comment = ? WHERE id = ?", `Cancelled at billing: ${reason}`, c.source_id);
    } else if (c.source_type === 'IMAGING' && c.source_id) {
      const o = await one<{ status: string }>('SELECT status FROM imaging_order WHERE id = ?', c.source_id);
      if (o && o.status !== 'ORDERED') throw new AppError('The study has been done — it cannot be cancelled from the bill', 'VALIDATION');
      await run("UPDATE imaging_order SET status = 'CANCELLED' WHERE id = ?", c.source_id);
    } else if (c.source_type === 'PHARMACY') {
      throw new AppError('Dispensed drugs are returned through the pharmacy, not cancelled on the bill', 'VALIDATION');
    } else if (c.source_type === 'PROCEDURE' && c.source_id) {
      await run("UPDATE procedure_record SET status = 'CANCELLED' WHERE id = ? AND status = 'ORDERED'", c.source_id);
    } else if (c.source_type === 'DENTAL' && c.source_id) {
      await run("UPDATE dental_treatment_item SET status = 'PLANNED', completed_visit_id = NULL, completed_at = NULL, completed_by = NULL, charge_id = NULL WHERE id = ?", c.source_id);
    }
    await run("UPDATE patient_charge SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?", nowIso(), user.username, reason, chargeId);
  });
  await audit(user, 'CHARGE_CANCEL', 'patient_charge', chargeId, { reason });
}

/** A discount or waiver on one line — CASHIER_DISCOUNT only; the reason is kept on the audit trail. */
export async function discountCharge(chargeId: number, v: Record<string, unknown>, user: Actor): Promise<void> {
  const c = await one<PatientCharge>('SELECT * FROM patient_charge WHERE id = ?', chargeId);
  if (!c) throw new AppError('Charge not found', 'NOT_FOUND');
  if (c.status !== 'OPEN') throw new AppError('Only an unbilled charge can be discounted', 'VALIDATION');
  await assertBillOpen(c.visit_id);
  const pct = String(v.discount_pct ?? '').trim();
  const amount = pct ? Math.round(Number(c.amount) * num(pct, 'Discount %', 0, 100) / 100) : money(v.discount, 'Discount');
  if (amount > Number(c.amount)) throw new AppError('The discount cannot exceed the charge', 'VALIDATION');
  const reason = req(v.reason, 'Reason', 300);
  await run('UPDATE patient_charge SET discount = ? WHERE id = ?', amount, chargeId);
  await audit(user, 'CHARGE_DISCOUNT', 'patient_charge', chargeId, { amount, reason });
}

/* ------------------------------------------------------------------ the split */

interface SplitLine { id: number; net: Cents; scheme: Cents }

/** Splits each open line between scheme and patient by the scheme's co-pay and per-visit limit. */
function splitLines(v: VisitForBilling, lines: { id: number; amount: Cents; discount: Cents }[]): SplitLine[] {
  const out = lines.map((l) => ({ id: l.id, net: Number(l.amount) - Number(l.discount), scheme: 0 }));
  if (v.payment_mode === 'CASH' || !v.scheme_id) return out;
  for (const l of out) {
    l.scheme = v.copay_type === 'PERCENT' ? Math.round(l.net * (1 - Number(v.copay_value ?? 0) / 100)) : l.net;
  }
  // A fixed co-pay comes off the scheme's share, first lines first.
  if (v.copay_type === 'FIXED') {
    let left = Number(v.copay_value ?? 0);
    for (const l of out) { const take = Math.min(left, l.scheme); l.scheme -= take; left -= take; if (left <= 0) break; }
  }
  // The scheme's per-visit limit — anything over is the patient's.
  const limit = Number(v.visit_limit ?? 0);
  if (limit > 0) {
    let room = limit;
    for (const l of out) { const take = Math.min(room, l.scheme); l.scheme = take; room -= take; }
  }
  return out;
}

/** Live position of a visit: charges, the split, receipts and what is left to pay. */
export async function visitAccount(visitId: number): Promise<VisitAccount> {
  const v = await visitForBilling(visitId);
  const bill = await one<PatientBill>("SELECT * FROM patient_bill WHERE visit_id = ? AND status = 'FINAL'", visitId);
  const paid = Number((await one<{ s: number }>("SELECT COALESCE(SUM(amount),0) AS s FROM patient_payment WHERE visit_id = ? AND status = 'POSTED'", visitId))?.s ?? 0);
  if (bill) {
    return { gross: Number(bill.gross), discount: Number(bill.discount), net: Number(bill.net), schemeShare: Number(bill.scheme_share), patientShare: Number(bill.patient_share), paid, balance: Number(bill.patient_share) - paid };
  }
  const lines = await all<{ id: number; amount: Cents; discount: Cents }>("SELECT id, amount, discount FROM patient_charge WHERE visit_id = ? AND status = 'OPEN' ORDER BY id", visitId);
  const split = splitLines(v, lines);
  const gross = lines.reduce((a, l) => a + Number(l.amount), 0);
  const discount = lines.reduce((a, l) => a + Number(l.discount), 0);
  const schemeShare = split.reduce((a, l) => a + l.scheme, 0);
  const net = gross - discount;
  return { gross, discount, net, schemeShare, patientShare: net - schemeShare, paid, balance: net - schemeShare - paid };
}

/* ------------------------------------------------------------------ finalise */

export const getBillByVisit = (visitId: number): Promise<PatientBill | undefined> => one<PatientBill>('SELECT * FROM patient_bill WHERE visit_id = ?', visitId);

/**
 * Finalises the visit's bill: freezes the charges and their split, posts the revenue journal,
 * raises the claim for the scheme share, and closes the visit.
 */
export async function finaliseBill(visitNo: string, user: Actor): Promise<{ billNo: string; claimNo: string | null; balance: Cents }> {
  const result = await tx(async () => {
    const visit = await one<{ id: number; status: string; member_no: string | null }>('SELECT id, status, member_no FROM visit WHERE no = ?', visitNo);
    if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
    if (visit.status === 'CANCELLED') throw new AppError('The visit was cancelled', 'VALIDATION');
    await assertBillOpen(visit.id);
    const v = await visitForBilling(visit.id);
    const pending = await one<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM lab_order_test t JOIN lab_order o ON o.id = t.lab_order_id WHERE o.visit_id = @v AND t.status IN ('ORDERED'))::int
            + (SELECT COUNT(*) FROM prescription_line l JOIN prescription p ON p.id = l.prescription_id WHERE p.visit_id = @v AND l.status = 'PENDING')::int AS n`,
      { v: visit.id },
    );
    if (pending && pending.n > 0) {
      throw new AppError(`${pending.n} order(s) on this visit are still outstanding (samples not taken or drugs not dispensed) — complete or cancel them first`, 'VALIDATION');
    }
    const lines = await all<{ id: number; amount: Cents; discount: Cents; revenue_account_id: number | null }>(
      `SELECT c.id, c.amount, c.discount, cat.revenue_account_id FROM patient_charge c LEFT JOIN service_item s ON s.id = c.service_item_id
       LEFT JOIN service_category cat ON cat.code = s.category_code WHERE c.visit_id = ? AND c.status = 'OPEN' ORDER BY c.id`, visit.id,
    );
    if (!lines.length) throw new AppError('There is nothing on this visit to bill', 'VALIDATION');
    const setup = await getClinicSetup();
    if (!setup.patient_receivable_account_id || !setup.unbilled_claims_account_id || !setup.discount_account_id) {
      throw new AppError('Clinic Setup is missing the patient receivables, unbilled claims or discount account', 'VALIDATION');
    }
    const split = splitLines(v, lines);
    const gross = lines.reduce((a, l) => a + Number(l.amount), 0);
    const discount = lines.reduce((a, l) => a + Number(l.discount), 0);
    const schemeShare = split.reduce((a, l) => a + l.scheme, 0);
    const net = gross - discount;
    const patientShare = net - schemeShare;

    const existing = await getBillByVisit(visit.id);
    const no = existing?.no ?? (await nextSequence('PATIENT_BILL'));
    const today = todayIso();
    let billId: number;
    if (existing) {
      billId = existing.id;
      await run(`UPDATE patient_bill SET gross = ?, discount = ?, net = ?, patient_share = ?, scheme_share = ?, bill_date = ?, status = 'FINAL', finalised_at = ?, finalised_by = ? WHERE id = ?`,
        gross, discount, net, patientShare, schemeShare, today, nowIso(), user.username, billId);
    } else {
      billId = (await run(
        `INSERT INTO patient_bill (no, visit_id, patient_id, payment_mode, scheme_id, bill_date, gross, discount, net, patient_share, scheme_share, status, finalised_at, finalised_by, created_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, 'FINAL', ?,?,?,?)`,
        no, visit.id, v.patient_id, v.payment_mode, v.scheme_id, today, gross, discount, net, patientShare, schemeShare, nowIso(), user.username, nowIso(), user.username,
      )).lastInsertRowid;
    }
    for (const s of split) await run("UPDATE patient_charge SET status = 'BILLED', bill_id = ?, scheme_amount = ? WHERE id = ?", billId, s.scheme, s.id);

    // Revenue by account (gross), funded by the patient share, the scheme share and the discounts.
    const byAccount = new Map<number, Cents>();
    for (const l of lines) {
      const acc = l.revenue_account_id ?? setup.default_revenue_account_id;
      if (!acc) throw new AppError('A service has no revenue account and Clinic Setup has no default', 'VALIDATION');
      byAccount.set(acc, (byAccount.get(acc) ?? 0) + Number(l.amount));
    }
    const journalLines = [
      ...(patientShare > 0 ? [{ account: setup.patient_receivable_account_id, debit: patientShare, credit: 0, narration: `Patient share ${no}` }] : []),
      ...(schemeShare > 0 ? [{ account: setup.unbilled_claims_account_id, debit: schemeShare, credit: 0, narration: `Scheme share ${no}` }] : []),
      ...(discount > 0 ? [{ account: setup.discount_account_id, debit: discount, credit: 0, narration: `Discounts on ${no}` }] : []),
      ...[...byAccount.entries()].filter(([, amt]) => amt > 0).map(([account, amt]) => ({ account, debit: 0, credit: amt, narration: `Services ${visitNo}` })),
    ];
    let journalId: number | null = null;
    if (gross > 0) {
      const j = await postJournal({
        valueDate: today, module: 'CLINIC', eventType: 'PATIENT_BILL', reference: no, user, idempotencyKey: `BILL-${no}`,
        description: `Patient bill ${no} — visit ${visitNo}`, lines: journalLines,
      });
      journalId = j.id;
      await run('UPDATE patient_bill SET journal_id = ? WHERE id = ?', journalId, billId);
    }

    let claimNo: string | null = null;
    if (schemeShare > 0 && v.scheme_id) {
      claimNo = await nextSequence('INSURANCE_CLAIM');
      const preauth = await one<{ no: string }>("SELECT no FROM preauthorization WHERE visit_id = ? AND status = 'APPROVED' ORDER BY id DESC LIMIT 1", visit.id);
      await run(`INSERT INTO insurance_claim (no, scheme_id, patient_id, visit_id, bill_id, member_no, preauth_no, claim_date, amount, status, created_at, created_by)
                 VALUES (?,?,?,?,?,?,?,?,?, 'DRAFT', ?,?)`, claimNo, v.scheme_id, v.patient_id, visit.id, billId, visit.member_no, preauth?.no ?? null, today, schemeShare, nowIso(), user.username);
    }
    await run(`UPDATE visit SET status = 'CLOSED', stage = 'COMPLETED', closed_at = COALESCE(closed_at, ?), closed_by = COALESCE(closed_by, ?) WHERE id = ?`, nowIso(), user.username, visit.id);
    await run("UPDATE visit_queue SET status = 'DONE', completed_at = ? WHERE visit_id = ? AND status IN ('WAITING','CALLED','SERVING')", nowIso(), visit.id);
    return { billNo: no, claimNo, visitId: visit.id };
  });
  await audit(user, 'BILL_FINALISE', 'patient_bill', result.billNo, { visit: visitNo, claim: result.claimNo });
  const acc = await visitAccount(result.visitId);
  return { billNo: result.billNo, claimNo: result.claimNo, balance: acc.balance };
}

/* ------------------------------------------------------------------ the cashier */

async function bankForMethod(method: PatientPaymentMethod, override: number | null): Promise<{ id: number; gl_account_id: number; name: string }> {
  const setup = await getClinicSetup();
  const id = override ?? (method === 'CASH' ? setup.cash_bank_account_id : method === 'MPESA' ? setup.mpesa_bank_account_id
    : method === 'CARD' ? setup.card_bank_account_id : setup.bank_transfer_account_id);
  if (!id) throw new AppError(`Clinic Setup names no bank account for ${method} receipts`, 'VALIDATION');
  const b = await one<{ id: number; gl_account_id: number; name: string; status: string }>('SELECT id, gl_account_id, name, status FROM bank_account WHERE id = ?', id);
  if (!b || b.status !== 'ACTIVE') throw new AppError('The receiving account is not active', 'VALIDATION');
  return b;
}

/**
 * Takes money from a patient against a visit. A cash receipt may be tendered above what is due —
 * the change is returned, never banked. Nothing above the patient's outstanding share is accepted.
 */
export async function receivePayment(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ no: string; change: Cents; balance: Cents }> {
  const method = pick(v.method, PAYMENT_METHODS, 'Payment method');
  const reference = text(v.reference, method === 'MPESA' ? 'M-Pesa code' : 'Reference', { required: method === 'MPESA', max: 40 })?.toUpperCase() ?? null;
  if (method === 'MPESA' && !/^[A-Z0-9]{10}$/.test(reference!)) throw new AppError('An M-Pesa code is 10 letters and digits (e.g. SGH4K7XQ2P)', 'VALIDATION');
  const tendered = method === 'CASH' && String(v.tendered ?? '').trim() ? money(v.tendered, 'Amount tendered', { positive: true }) : null;
  const requested = money(v.amount, 'Amount', { positive: tendered == null });
  const r = await tx(async () => {
    const visit = await one<{ id: number; patient_id: number; status: string }>('SELECT id, patient_id, status FROM visit WHERE no = ?', visitNo);
    if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
    if (visit.status === 'CANCELLED') throw new AppError('The visit was cancelled', 'VALIDATION');
    const acc = await visitAccount(visit.id);
    if (acc.balance <= 0) throw new AppError('Nothing is owed on this visit', 'VALIDATION');
    const amount = Math.min(requested || tendered || 0, acc.balance);
    if (amount <= 0) throw new AppError('Enter the amount received', 'VALIDATION');
    if (requested > acc.balance && tendered == null) throw new AppError(`Only ${(acc.balance / 100).toFixed(2)} is owed on this visit`, 'VALIDATION');
    if (tendered != null && tendered < amount) throw new AppError('The cash tendered is less than the amount', 'VALIDATION');
    const bank = await bankForMethod(method, optId(v.bank_account_id, 'Account'));
    const setup = await getClinicSetup();
    if (!setup.patient_receivable_account_id) throw new AppError('Clinic Setup has no patient receivables account', 'VALIDATION');
    const no = await nextSequence('PATIENT_RECEIPT');
    const today = todayIso();
    const j = await postJournal({
      valueDate: today, module: 'CLINIC', eventType: 'PATIENT_RECEIPT', reference: no, user, idempotencyKey: `PRCT-${no}`,
      description: `Receipt ${no} — visit ${visitNo} (${method})`,
      lines: [
        { account: bank.gl_account_id, debit: amount, credit: 0, narration: `${method} ${reference ?? ''}`.trim(), bankDocumentType: 'Payment', bankDocumentNo: no, bankExternalDocumentNo: reference },
        { account: setup.patient_receivable_account_id, debit: 0, credit: amount, narration: `Visit ${visitNo}` },
      ],
    });
    await run(`INSERT INTO patient_payment (no, patient_id, visit_id, payment_date, method, reference, amount, bank_account_id, journal_id, received_by, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`, no, visit.patient_id, visit.id, today, method, reference, amount, bank.id, j.id, user.username, nowIso());
    return { no, change: tendered != null ? tendered - amount : 0, balance: acc.balance - amount, amount };
  });
  await audit(user, 'PATIENT_RECEIPT', 'patient_payment', r.no, { visit: visitNo, method, amount: r.amount });
  return { no: r.no, change: r.change, balance: r.balance };
}

export async function voidPayment(no: string, reasonRaw: unknown, user: Actor): Promise<void> {
  const reason = req(reasonRaw, 'Reason', 300);
  await tx(async () => {
    const p = await one<PatientPayment & { gl_account_id: number }>(
      'SELECT pp.*, b.gl_account_id FROM patient_payment pp JOIN bank_account b ON b.id = pp.bank_account_id WHERE pp.no = ?', no);
    if (!p) throw new AppError('Receipt not found', 'NOT_FOUND');
    if (p.status === 'VOIDED') throw new AppError('Already voided', 'VALIDATION');
    if (p.received_by === user.username && p.payment_date !== todayIso()) {
      throw new AppError('A receipt from an earlier day is voided by a supervisor, not the cashier who took it', 'FORBIDDEN');
    }
    const setup = await getClinicSetup();
    const j = await postJournal({
      valueDate: todayIso(), module: 'CLINIC', eventType: 'PATIENT_RECEIPT_VOID', reference: no, user, idempotencyKey: `VOID-${no}`,
      description: `Void of receipt ${no}: ${reason}`,
      lines: [
        { account: setup.patient_receivable_account_id!, debit: Number(p.amount), credit: 0, narration: `Void ${no}` },
        { account: p.gl_account_id, debit: 0, credit: Number(p.amount), narration: `Void ${no}`, bankDocumentType: 'Refund', bankDocumentNo: no },
      ],
    });
    await run("UPDATE patient_payment SET status = 'VOIDED', voided_at = ?, voided_by = ?, void_reason = ?, void_journal_id = ? WHERE id = ?", nowIso(), user.username, reason, j.id, p.id);
  });
  await audit(user, 'PATIENT_RECEIPT_VOID', 'patient_payment', no, { reason });
}

export const listVisitPayments = (visitId: number): Promise<PatientPayment[]> => all<PatientPayment>(
  'SELECT pp.*, b.name AS bank_account_name FROM patient_payment pp JOIN bank_account b ON b.id = pp.bank_account_id WHERE pp.visit_id = ? ORDER BY pp.id', visitId,
);

export async function listReceipts(from: string, to: string, q = '', method = ''): Promise<PatientPayment[]> {
  return all<PatientPayment>(
    `SELECT pp.*, p.mrn, trim(p.first_name || ' ' || p.last_name) AS patient_name, v.no AS visit_no, b.name AS bank_account_name
     FROM patient_payment pp JOIN patient p ON p.id = pp.patient_id LEFT JOIN visit v ON v.id = pp.visit_id JOIN bank_account b ON b.id = pp.bank_account_id
     WHERE pp.payment_date BETWEEN @from AND @to AND (@m = '' OR pp.method = @m)
       AND (@q = '' OR pp.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR pp.reference ILIKE '%' || @q || '%' OR p.last_name ILIKE '%' || @q || '%')
     ORDER BY pp.id DESC LIMIT 1000`, { from, to, q, m: method },
  );
}

/** The day's collections by method and by cashier — the cashier's own close-of-shift check. */
export async function collectionsSummary(from: string, to: string): Promise<{
  byMethod: { method: string; n: number; amount: Cents }[]; byCashier: { received_by: string; n: number; amount: Cents }[]; voided: { n: number; amount: Cents };
}> {
  const [byMethod, byCashier, voided] = await Promise.all([
    all<{ method: string; n: number; amount: Cents }>("SELECT method, COUNT(*)::int n, COALESCE(SUM(amount),0) amount FROM patient_payment WHERE status = 'POSTED' AND payment_date BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC", from, to),
    all<{ received_by: string; n: number; amount: Cents }>("SELECT received_by, COUNT(*)::int n, COALESCE(SUM(amount),0) amount FROM patient_payment WHERE status = 'POSTED' AND payment_date BETWEEN ? AND ? GROUP BY received_by ORDER BY amount DESC", from, to),
    one<{ n: number; amount: Cents }>("SELECT COUNT(*)::int n, COALESCE(SUM(amount),0) amount FROM patient_payment WHERE status = 'VOIDED' AND payment_date BETWEEN ? AND ?", from, to),
  ]);
  return { byMethod, byCashier, voided: voided ?? { n: 0, amount: 0 } };
}

/** Visits with something to collect — the cashier's queue. */
interface CashierRow {
  visit_id: number; visit_no: string; visit_date: string; mrn: string; patient_name: string; payment_mode: string; scheme_name: string | null;
  stage: string; status: string; gross: Cents; paid: Cents; bill_no: string | null; bill_status: string | null; patient_share: Cents | null;
}

export async function cashierQueue(view: 'open' | 'unpaid' | 'all', q = ''): Promise<(CashierRow & { balance: Cents })[]> {
  const rows = await all<CashierRow>(
    `SELECT v.id AS visit_id, v.no AS visit_no, v.visit_date, p.mrn, trim(p.first_name || ' ' || p.last_name) AS patient_name, v.payment_mode,
            s.name AS scheme_name, v.stage, v.status,
            COALESCE((SELECT SUM(c.amount - c.discount) FROM patient_charge c WHERE c.visit_id = v.id AND c.status <> 'CANCELLED'), 0) AS gross,
            COALESCE((SELECT SUM(pp.amount) FROM patient_payment pp WHERE pp.visit_id = v.id AND pp.status = 'POSTED'), 0) AS paid,
            b.no AS bill_no, b.status AS bill_status, b.patient_share
     FROM visit v JOIN patient p ON p.id = v.patient_id LEFT JOIN insurance_scheme s ON s.id = v.scheme_id LEFT JOIN patient_bill b ON b.visit_id = v.id
     WHERE v.status <> 'CANCELLED' AND (@view <> 'open' OR v.status = 'OPEN')
       AND (@view <> 'unpaid' OR (b.status = 'FINAL' AND b.patient_share > COALESCE((SELECT SUM(pp.amount) FROM patient_payment pp WHERE pp.visit_id = v.id AND pp.status = 'POSTED'), 0)))
       AND (@view <> 'all' OR v.visit_date >= to_char(current_date - 30, 'YYYY-MM-DD'))
       AND (@q = '' OR v.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR p.last_name ILIKE '%' || @q || '%' OR p.first_name ILIKE '%' || @q || '%')
     ORDER BY CASE v.stage WHEN 'CASHIER' THEN 0 ELSE 1 END, v.check_in_at DESC LIMIT 500`, { view, q },
  );
  // The patient's share of an unfinalised visit is estimated through the same split the bill will use.
  const out: (CashierRow & { balance: Cents })[] = [];
  for (const r of rows) {
    const share = r.bill_status === 'FINAL' ? Number(r.patient_share) : (await visitAccount(r.visit_id)).patientShare;
    out.push({ ...r, balance: share - Number(r.paid) });
  }
  return out;
}
