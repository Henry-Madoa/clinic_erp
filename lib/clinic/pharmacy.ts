/*
 * Pharmacy — dispensing against prescriptions, and over-the-counter sales.
 *
 * Dispensing a line issues the stock from the pharmacy store through the ERP's item journal
 * (a Negative Adjmt. posted at FIFO cost — Dr Drugs Consumed / Cr Drug Inventory, through the
 * DRUGS posting groups) and raises the drug charge on the visit at the visit's tariff. A line the
 * store cannot cover is refused rather than driving stock negative; the pharmacist may dispense a
 * smaller quantity (a partial fill) or mark it out of stock so the patient buys it elsewhere.
 */
import { one, all, run, tx, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, int, nowIso, todayIso, q as qText } from '../input.ts';
import { createItemJournalLine, postItemJournalLine } from '../itemJournal.ts';
import { addCharge } from './billing.ts';
import { getClinicSetup } from './setup.ts';
import { AGE_SQL, NAME_SQL } from './patients.ts';
import type { Actor, Prescription, PrescriptionLine } from '../types.ts';

const RX_SELECT = `
  SELECT rx.*, v.no AS visit_no, p.mrn, ${NAME_SQL()} AS patient_name, p.sex, ${AGE_SQL()} AS age, p.allergies, v.payment_mode, s.name AS scheme_name,
         (SELECT COUNT(*)::int FROM prescription_line l WHERE l.prescription_id = rx.id) AS lines
  FROM prescription rx JOIN visit v ON v.id = rx.visit_id JOIN patient p ON p.id = rx.patient_id LEFT JOIN insurance_scheme s ON s.id = v.scheme_id`;

export async function prescriptionQueue(view: 'pending' | 'dispensed' | 'all', q = ''): Promise<Prescription[]> {
  const where = view === 'pending' ? "rx.status IN ('PENDING','PARTIAL') AND v.status = 'OPEN'" : view === 'dispensed'
    ? "rx.status = 'DISPENSED' AND substr(rx.prescribed_at,1,10) >= to_char(current_date - 14, 'YYYY-MM-DD')" : "substr(rx.prescribed_at,1,10) >= to_char(current_date - 30, 'YYYY-MM-DD')";
  return all<Prescription>(
    `${RX_SELECT} WHERE ${where} AND (@q = '' OR rx.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR ${NAME_SQL()} ILIKE '%' || @q || '%')
     ORDER BY rx.prescribed_at ${view === 'pending' ? 'ASC' : 'DESC'} LIMIT 300`, { q: qText(q) },
  );
}

export const getPrescription = (no: string): Promise<Prescription | undefined> => one<Prescription>(`${RX_SELECT} WHERE rx.no = @no`, { no });

export async function prescriptionLines(prescriptionId: number): Promise<PrescriptionLine[]> {
  const setup = await getClinicSetup();
  return all<PrescriptionLine>(
    `SELECT l.*, d.generic_name, d.brand_name, d.strength, d.dosage_form, COALESCE(s.base_price, 0) AS price,
            COALESCE((SELECT sk.inventory FROM stockkeeping_unit sk WHERE sk.item_id = d.item_id AND sk.location_id = @loc), 0) AS stock
     FROM prescription_line l JOIN drug d ON d.id = l.drug_id LEFT JOIN service_item s ON s.id = d.service_item_id
     WHERE l.prescription_id = @id ORDER BY l.id`, { id: prescriptionId, loc: setup.pharmacy_location_id ?? 0 },
  );
}

/** Stock on hand at the pharmacy store. */
export async function storeStock(itemId: number): Promise<number> {
  const setup = await getClinicSetup();
  const r = await one<{ inventory: number }>('SELECT inventory FROM stockkeeping_unit WHERE item_id = ? AND location_id = ?', itemId, setup.pharmacy_location_id ?? 0);
  return Number(r?.inventory ?? 0);
}

async function refreshPrescriptionStatus(prescriptionId: number): Promise<void> {
  const r = await one<{ pending: number; dispensed: number }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending, COUNT(*) FILTER (WHERE status = 'DISPENSED')::int AS dispensed
     FROM prescription_line WHERE prescription_id = ?`, prescriptionId);
  const status = !r?.pending ? (r?.dispensed ? 'DISPENSED' : 'CANCELLED') : r.dispensed ? 'PARTIAL' : 'PENDING';
  await run('UPDATE prescription SET status = ? WHERE id = ?', status, prescriptionId);
}

/** Issues stock for one line and raises its charge. `qty` defaults to what was prescribed. */
async function dispenseLine(line: PrescriptionLine & { visit_id: number; item_id: number; service_item_id: number | null; base_unit_of_measure_id: number; label: string }, qty: number, user: Actor): Promise<void> {
  const setup = await getClinicSetup();
  if (!setup.pharmacy_location_id) throw new AppError('Clinic Setup names no pharmacy store', 'VALIDATION');
  if (!line.service_item_id) throw new AppError(`${line.label} has no selling price on the charge master`, 'VALIDATION');
  const stock = await storeStock(line.item_id);
  if (stock < qty) throw new AppError(`${line.label}: only ${stock} in the pharmacy store — dispense less or mark it out of stock`, 'VALIDATION');
  const { no } = await createItemJournalLine({
    postingDate: todayIso(), entryType: 'Negative Adjmt.', itemId: line.item_id, locationId: setup.pharmacy_location_id,
    description: `Dispensed — Rx line ${line.id}`, unitOfMeasureId: line.base_unit_of_measure_id, quantity: qty,
  }, user);
  await run("UPDATE item_journal_line SET status = 'Approved' WHERE no = ?", no);
  await postItemJournalLine(no, user);
  const charge = await addCharge(line.visit_id, { serviceItemId: line.service_item_id, quantity: qty, sourceType: 'PHARMACY', sourceId: line.id, description: `${line.label} × ${qty}` }, user);
  await run("UPDATE prescription_line SET status = 'DISPENSED', dispensed_qty = ?, charge_id = ?, item_journal_no = ?, dispensed_at = ?, dispensed_by = ? WHERE id = ?",
    qty, charge, no, nowIso(), user.username, line.id);
}

/**
 * Dispenses the lines picked on the prescription. `v` carries `qty_<lineId>` for each line to
 * dispense (blank = skip) and `oos_<lineId>` = 1 to mark a line out of stock.
 */
export async function dispense(rxNo: string, v: Record<string, unknown>, user: Actor): Promise<{ dispensed: number; outOfStock: number }> {
  const result = await tx(async () => {
    const rx = await one<{ id: number; visit_id: number; status: string; visit_status: string; payment_mode: string }>(
      'SELECT rx.id, rx.visit_id, rx.status, v.status AS visit_status, v.payment_mode FROM prescription rx JOIN visit v ON v.id = rx.visit_id WHERE rx.no = ?', rxNo);
    if (!rx) throw new AppError('Prescription not found', 'NOT_FOUND');
    if (rx.visit_status !== 'OPEN') throw new AppError('The visit is closed', 'VALIDATION');
    if (rx.status === 'DISPENSED' || rx.status === 'CANCELLED') throw new AppError('Nothing left to dispense', 'VALIDATION');
    const setup = await getClinicSetup();
    const lines = await all<PrescriptionLine & { visit_id: number; item_id: number; service_item_id: number | null; base_unit_of_measure_id: number; label: string }>(
      `SELECT l.*, rx.visit_id, d.item_id, d.service_item_id, i.base_unit_of_measure_id,
              trim(d.generic_name || ' ' || COALESCE(d.strength, '')) AS label
       FROM prescription_line l JOIN prescription rx ON rx.id = l.prescription_id JOIN drug d ON d.id = l.drug_id JOIN item i ON i.id = d.item_id
       WHERE l.prescription_id = ? AND l.status = 'PENDING' ORDER BY l.id`, rx.id);
    // Cash patients settle what they already owe (consultation, tests) before drugs are handed over,
    // when the clinic runs pay-before-service.
    if (setup.pay_before_service && rx.payment_mode === 'CASH') {
      const { visitAccount } = await import('./billing.ts');
      const acc = await visitAccount(rx.visit_id);
      if (acc.balance > 0) throw new AppError('This cash patient has an unpaid balance — send them to the cashier first', 'VALIDATION');
    }
    let dispensed = 0; let outOfStock = 0;
    for (const l of lines) {
      if (String(v[`oos_${l.id}`] ?? '') === '1') {
        await run("UPDATE prescription_line SET status = 'OUT_OF_STOCK' WHERE id = ?", l.id);
        outOfStock++;
        continue;
      }
      const raw = String(v[`qty_${l.id}`] ?? '').trim();
      if (!raw) continue;
      const qty = int(raw, `${l.label} quantity`, 1, l.quantity);
      await dispenseLine(l, qty, user);
      dispensed++;
    }
    if (!dispensed && !outOfStock) throw new AppError('Enter a quantity for at least one line', 'VALIDATION');
    await refreshPrescriptionStatus(rx.id);
    const left = await one("SELECT 1 FROM prescription_line l JOIN prescription p ON p.id = l.prescription_id WHERE p.visit_id = ? AND l.status = 'PENDING'", rx.visit_id);
    if (!left) {
      await run("UPDATE visit_queue SET status = 'DONE', completed_at = ?, served_by = ? WHERE visit_id = ? AND department_code = 'PHARM' AND status IN ('WAITING','CALLED','SERVING')", nowIso(), user.username, rx.visit_id);
      const visit = await one<{ stage: string }>('SELECT stage FROM visit WHERE id = ?', rx.visit_id);
      if (visit?.stage === 'PHARMACY') {
        await run("UPDATE visit SET stage = 'CASHIER' WHERE id = ?", rx.visit_id);
        const { enqueue } = await import('./visits.ts');
        await enqueue(rx.visit_id, 'CASH');
      }
    }
    return { dispensed, outOfStock };
  });
  await audit(user, 'DISPENSE', 'prescription', rxNo, result);
  return result;
}

export async function cancelPrescriptionLine(lineId: number, reasonRaw: unknown, user: Actor): Promise<void> {
  const reason = text(reasonRaw, 'Reason', { required: true, max: 300 });
  const l = await one<{ prescription_id: number; status: string }>('SELECT prescription_id, status FROM prescription_line WHERE id = ?', lineId);
  if (!l) throw new AppError('Line not found', 'NOT_FOUND');
  if (l.status !== 'PENDING' && l.status !== 'OUT_OF_STOCK') throw new AppError('Only an undispensed line can be cancelled', 'VALIDATION');
  await run("UPDATE prescription_line SET status = 'CANCELLED', instructions = COALESCE(instructions || ' · ', '') || ? WHERE id = ?", `Cancelled: ${reason}`, lineId);
  await refreshPrescriptionStatus(l.prescription_id);
  await audit(user, 'RX_LINE_CANCEL', 'prescription_line', lineId, { reason });
}

/** Drugs at or below their reorder point in the pharmacy store, and batches near expiry are tracked by the item ledger. */
export const lowStock = () => getClinicSetup().then((s) => all<{ id: number; generic_name: string; strength: string | null; stock: number; reorder_point: number; item_no: string }>(
  `SELECT d.id, d.generic_name, d.strength, i.no AS item_no, COALESCE(sk.inventory, 0) AS stock, i.reorder_point
   FROM drug d JOIN item i ON i.id = d.item_id LEFT JOIN stockkeeping_unit sk ON sk.item_id = d.item_id AND sk.location_id = ?
   WHERE d.status = 'ACTIVE' AND COALESCE(sk.inventory, 0) <= i.reorder_point ORDER BY COALESCE(sk.inventory, 0), d.generic_name`, s.pharmacy_location_id ?? 0));

/** Dispensing by drug over a period — consumption, revenue and cost. */
export const dispensingSummary = (from: string, to: string) => all<{ generic_name: string; strength: string | null; qty: number; revenue: number; patients: number }>(
  `SELECT d.generic_name, d.strength, SUM(l.dispensed_qty)::int AS qty, COALESCE(SUM(c.amount - c.discount), 0) AS revenue, COUNT(DISTINCT rx.patient_id)::int AS patients
   FROM prescription_line l JOIN prescription rx ON rx.id = l.prescription_id JOIN drug d ON d.id = l.drug_id LEFT JOIN patient_charge c ON c.id = l.charge_id
   WHERE l.status = 'DISPENSED' AND substr(l.dispensed_at,1,10) BETWEEN ? AND ? GROUP BY d.generic_name, d.strength ORDER BY revenue DESC LIMIT 50`, from, to,
);
