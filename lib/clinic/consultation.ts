/*
 * The clinician's work on a visit: the SOAP note, ICD-10 diagnoses, and orders.
 *
 * Every order raises its charge on the visit at the visit's tariff and puts the patient in the
 * service point's queue: lab tests (one request, many tests), an imaging study, a prescription
 * (lines checked against the patient's recorded allergies), a procedure or nursing service.
 * Referral letters and sick-off notes are issued from the same screen and print on letterhead.
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, int, pick, optId, isoDate, nowIso, todayIso } from '../input.ts';
import { addCharge } from './billing.ts';
import { enqueue, SERVICE_POINT } from './visits.ts';
import { FREQUENCIES, ROUTES } from './setup.ts';
import type { Actor, ClinicalDocument, Consultation, Diagnosis, ImagingOrder, PrescriptionLine, ProcedureRecord } from '../types.ts';

export const MODALITIES = ['XRAY', 'ULTRASOUND', 'OPG', 'CBCT', 'ECG', 'CT', 'MRI'] as const;
const LAB_PRIORITIES = ['ROUTINE', 'URGENT', 'STAT'] as const;

async function openVisit(visitNo: string): Promise<{ id: number; patient_id: number; department_code: string; status: string }> {
  const v = await one<{ id: number; patient_id: number; department_code: string; status: string }>('SELECT id, patient_id, department_code, status FROM visit WHERE no = ?', visitNo);
  if (!v) throw new AppError('Visit not found', 'NOT_FOUND');
  if (v.status !== 'OPEN') throw new AppError('The visit is closed — reopen a new visit to add to it', 'VALIDATION');
  if (await one("SELECT 1 FROM patient_bill WHERE visit_id = ? AND status = 'FINAL'", v.id)) throw new AppError('The bill is final', 'VALIDATION');
  return v;
}

/* ------------------------------------------------------------------ notes */

export const listConsultations = (visitId: number): Promise<Consultation[]> => all<Consultation>('SELECT * FROM consultation WHERE visit_id = ? ORDER BY id', visitId);

/** Saves the signed-in clinician's note on the visit (one open note per clinician; created on first save). */
export async function saveConsultation(visitNo: string, v: Record<string, unknown>, user: Actor & { full_name?: string }): Promise<void> {
  const field = (k: string, label: string) => text(v[k], label, { max: 8000 });
  await tx(async () => {
    const visit = await openVisit(visitNo);
    const vals = [
      field('chief_complaint', 'Chief complaint'), field('history', 'History of presenting illness'), field('past_history', 'Past medical history'),
      field('family_social_history', 'Family & social history'), field('review_of_systems', 'Review of systems'), field('examination', 'Examination'),
      field('assessment', 'Assessment'), field('plan', 'Plan'),
    ];
    const mine = await one<{ id: number }>("SELECT id FROM consultation WHERE visit_id = ? AND clinician_user_id = ? AND status = 'OPEN'", visit.id, user.id);
    if (mine) {
      await run(`UPDATE consultation SET chief_complaint = ?, history = ?, past_history = ?, family_social_history = ?, review_of_systems = ?, examination = ?,
                 assessment = ?, plan = ? WHERE id = ?`, ...vals, mine.id);
    } else {
      const name = (await one<{ full_name: string }>('SELECT full_name FROM app_user WHERE id = ?', user.id))?.full_name ?? user.username;
      await run(`INSERT INTO consultation (visit_id, department_code, clinician_user_id, clinician_name, chief_complaint, history, past_history, family_social_history,
                 review_of_systems, examination, assessment, plan, started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      visit.id, visit.department_code, user.id, name, ...vals, nowIso());
      await run('UPDATE visit SET clinician_user_id = COALESCE(clinician_user_id, ?) WHERE id = ?', user.id, visit.id);
      await run("UPDATE visit_queue SET status = 'SERVING', served_by = ? WHERE visit_id = ? AND department_code = ? AND status IN ('WAITING','CALLED')", user.username, visit.id, visit.department_code);
    }
    if (vals[0]) await run('UPDATE visit SET chief_complaint = COALESCE(chief_complaint, ?) WHERE id = ?', vals[0], visit.id);
  });
  await audit(user, 'CONSULTATION_SAVE', 'visit', visitNo);
}

/* ------------------------------------------------------------------ diagnoses */

export const listDiagnoses = (visitId: number): Promise<Diagnosis[]> => all<Diagnosis>('SELECT * FROM diagnosis WHERE visit_id = ? ORDER BY CASE diagnosis_type WHEN \'PRIMARY\' THEN 0 ELSE 1 END, id', visitId);

export async function addDiagnosis(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const visit = await openVisit(visitNo);
  let code = text(v.icd_code, 'ICD-10 code', { max: 10 })?.toUpperCase() ?? null;
  let description = text(v.description, 'Diagnosis', { max: 300 });
  if (code) {
    const icd = await one<{ code: string; title: string }>('SELECT code, title FROM icd_code WHERE code = ?', code);
    if (!icd) throw new AppError(`ICD-10 code ${code} is not in the code list — pick from the search, or add it under Clinic Setup`, 'VALIDATION');
    description ??= icd.title;
    code = icd.code;
  }
  if (!description) throw new AppError('Pick an ICD-10 code or describe the diagnosis', 'VALIDATION');
  const type = pick(v.diagnosis_type, ['PRIMARY', 'SECONDARY', 'PROVISIONAL'] as const, 'Type', 'PRIMARY');
  if (code && await one('SELECT 1 FROM diagnosis WHERE visit_id = ? AND icd_code = ?', visit.id, code)) throw new AppError('Already recorded on this visit', 'VALIDATION');
  await tx(async () => {
    if (type === 'PRIMARY') await run("UPDATE diagnosis SET diagnosis_type = 'SECONDARY' WHERE visit_id = ? AND diagnosis_type = 'PRIMARY'", visit.id);
    await run('INSERT INTO diagnosis (visit_id, icd_code, description, diagnosis_type, created_at, created_by) VALUES (?,?,?,?,?,?)', visit.id, code, description, type, nowIso(), user.username);
  });
  await audit(user, 'DIAGNOSIS_ADD', 'visit', visitNo, { code });
}

export async function removeDiagnosis(id: number, user: Actor): Promise<void> {
  const d = await one<{ visit_id: number; status: string }>('SELECT d.visit_id, v.status FROM diagnosis d JOIN visit v ON v.id = d.visit_id WHERE d.id = ?', id);
  if (!d) throw new AppError('Diagnosis not found', 'NOT_FOUND');
  if (d.status !== 'OPEN') throw new AppError('The visit is closed', 'VALIDATION');
  await run('DELETE FROM diagnosis WHERE id = ?', id);
  await audit(user, 'DIAGNOSIS_REMOVE', 'diagnosis', id);
}

/* ------------------------------------------------------------------ lab orders */

export async function orderLabTests(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  const ids = (Array.isArray(v.lab_test_ids) ? v.lab_test_ids : String(v.lab_test_ids ?? '').split(','))
    .map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
  const unique = [...new Set(ids)];
  if (!unique.length) throw new AppError('Pick at least one test', 'VALIDATION');
  if (unique.length > 40) throw new AppError('Too many tests on one request', 'VALIDATION');
  const r = await tx(async () => {
    const visit = await openVisit(visitNo);
    const tests = await all<{ id: number; name: string; service_item_id: number | null; status: string }>(
      `SELECT id, name, service_item_id, status FROM lab_test WHERE id IN (${unique.map(() => '?').join(',')})`, ...unique);
    if (tests.length !== unique.length) throw new AppError('A selected test does not exist', 'VALIDATION');
    const inactive = tests.find((t) => t.status !== 'ACTIVE' || !t.service_item_id);
    if (inactive) throw new AppError(`${inactive.name} is not currently offered`, 'VALIDATION');
    const dup = await one<{ name: string }>(
      `SELECT t.name FROM lab_order_test ot JOIN lab_order o ON o.id = ot.lab_order_id JOIN lab_test t ON t.id = ot.lab_test_id
       WHERE o.visit_id = ? AND ot.lab_test_id IN (${unique.map(() => '?').join(',')}) AND ot.status <> 'CANCELLED' LIMIT 1`, visit.id, ...unique);
    if (dup) throw new AppError(`${dup.name} is already requested on this visit`, 'VALIDATION');
    const no = await nextSequence('LAB_ORDER');
    const order = await run('INSERT INTO lab_order (no, visit_id, patient_id, priority, clinical_notes, ordered_at, ordered_by) VALUES (?,?,?,?,?,?,?)',
      no, visit.id, visit.patient_id, pick(v.priority, LAB_PRIORITIES, 'Priority', 'ROUTINE'), text(v.clinical_notes, 'Clinical notes', { max: 1000 }), nowIso(), user.username);
    for (const t of tests) {
      const ot = await run('INSERT INTO lab_order_test (lab_order_id, lab_test_id) VALUES (?,?)', order.lastInsertRowid, t.id);
      const charge = await addCharge(visit.id, { serviceItemId: t.service_item_id!, sourceType: 'LAB', sourceId: ot.lastInsertRowid }, user);
      await run('UPDATE lab_order_test SET charge_id = ? WHERE id = ?', charge, ot.lastInsertRowid);
    }
    await enqueue(visit.id, SERVICE_POINT.LAB);
    await run("UPDATE visit SET stage = 'INVESTIGATION' WHERE id = ? AND stage IN ('TRIAGE','CONSULTATION')", visit.id);
    return { no, count: tests.length };
  });
  await audit(user, 'LAB_ORDER', 'lab_order', r.no, { visit: visitNo, tests: r.count });
  return { no: r.no };
}

/* ------------------------------------------------------------------ imaging */

export async function orderImaging(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  const svcId = optId(v.service_item_id, 'Study');
  if (!svcId) throw new AppError('Pick the study', 'VALIDATION');
  const svc = await one<{ id: number; name: string; kind: string; status: string }>('SELECT id, name, kind, status FROM service_item WHERE id = ?', svcId);
  if (!svc || svc.kind !== 'IMAGING' || svc.status !== 'ACTIVE') throw new AppError('Pick an imaging study', 'VALIDATION');
  const modality = pick(v.modality, MODALITIES, 'Modality', /OPG|PANORAMIC/i.test(svc.name) ? 'OPG' : /ULTRA|SCAN/i.test(svc.name) ? 'ULTRASOUND' : /ECG/i.test(svc.name) ? 'ECG' : 'XRAY');
  const r = await tx(async () => {
    const visit = await openVisit(visitNo);
    const no = await nextSequence('IMAGING_ORDER');
    const info = await run(`INSERT INTO imaging_order (no, visit_id, patient_id, service_item_id, modality, body_part, clinical_notes, priority, ordered_at, ordered_by)
                            VALUES (?,?,?,?,?,?,?,?,?,?)`, no, visit.id, visit.patient_id, svc.id, modality, text(v.body_part, 'Body part / region', { max: 80 }),
    text(v.clinical_notes, 'Clinical notes', { max: 1000 }), pick(v.priority, LAB_PRIORITIES, 'Priority', 'ROUTINE'), nowIso(), user.username);
    const charge = await addCharge(visit.id, { serviceItemId: svc.id, sourceType: 'IMAGING', sourceId: info.lastInsertRowid }, user);
    await run('UPDATE imaging_order SET charge_id = ? WHERE id = ?', charge, info.lastInsertRowid);
    await enqueue(visit.id, SERVICE_POINT.IMAGING);
    await run("UPDATE visit SET stage = 'INVESTIGATION' WHERE id = ? AND stage IN ('TRIAGE','CONSULTATION')", visit.id);
    return { no };
  });
  await audit(user, 'IMAGING_ORDER', 'imaging_order', r.no, { visit: visitNo });
  return r;
}

export const listVisitImaging = (visitId: number): Promise<ImagingOrder[]> => all<ImagingOrder>(
  'SELECT o.*, s.name AS service_name FROM imaging_order o JOIN service_item s ON s.id = o.service_item_id WHERE o.visit_id = ? ORDER BY o.id', visitId,
);

/* ------------------------------------------------------------------ prescriptions */

export interface PrescriptionDraftLine { drug_id: number; dose: string; route: string; frequency: string; duration_days: number; quantity?: number; instructions?: string }

/** Quantity to dispense: dose units × times a day × days, for solid forms; 1 pack otherwise. */
function suggestQuantity(form: string, dose: string, frequency: string, days: number): number {
  const perDay = FREQUENCIES.find((f) => f.code === frequency)?.perDay ?? 1;
  if (!['TABLET', 'CAPSULE', 'SUPPOSITORY'].includes(form)) return 1;
  const units = Number(String(dose).match(/^\s*(\d+(?:\.\d+)?)/)?.[1] ?? 1);
  return Math.max(1, Math.ceil(units * perDay * (frequency === 'STAT' ? 1 : days)));
}

export async function prescribe(visitNo: string, lines: PrescriptionDraftLine[], notesRaw: unknown, user: Actor): Promise<{ no: string; allergyWarnings: string[] }> {
  if (!Array.isArray(lines) || !lines.length) throw new AppError('Add at least one drug', 'VALIDATION');
  if (lines.length > 25) throw new AppError('Too many lines on one prescription', 'VALIDATION');
  const r = await tx(async () => {
    const visit = await openVisit(visitNo);
    const patient = await one<{ allergies: string | null }>('SELECT allergies FROM patient WHERE id = ?', visit.patient_id);
    const allergyWords = String(patient?.allergies ?? '').toLowerCase().split(/[,;/]+/).map((s) => s.trim()).filter((s) => s.length >= 4 && s !== 'none' && s !== 'nkda');
    const warnings: string[] = [];
    const no = await nextSequence('PRESCRIPTION');
    const rx = await run('INSERT INTO prescription (no, visit_id, patient_id, notes, prescribed_at, prescribed_by) VALUES (?,?,?,?,?,?)',
      no, visit.id, visit.patient_id, text(notesRaw, 'Notes', { max: 1000 }), nowIso(), user.username);
    for (const [i, l] of lines.entries()) {
      const drug = await one<{ id: number; generic_name: string; brand_name: string | null; dosage_form: string; status: string }>(
        'SELECT id, generic_name, brand_name, dosage_form, status FROM drug WHERE id = ?', Number(l.drug_id));
      if (!drug || drug.status !== 'ACTIVE') throw new AppError(`Line ${i + 1}: pick a drug from the formulary`, 'VALIDATION');
      const name = `${drug.generic_name} ${drug.brand_name ?? ''}`.toLowerCase();
      for (const a of allergyWords) if (name.includes(a) || a.includes(drug.generic_name.toLowerCase())) warnings.push(`${drug.generic_name}: recorded allergy "${a}"`);
      const dose = req(l.dose, `Line ${i + 1} dose`, 40);
      const freq = pick(l.frequency, FREQUENCIES.map((f) => f.code), `Line ${i + 1} frequency`);
      const days = int(l.duration_days || 1, `Line ${i + 1} days`, 1, 365);
      const qty = l.quantity ? int(l.quantity, `Line ${i + 1} quantity`, 1, 100000) : suggestQuantity(drug.dosage_form, dose, freq, days);
      await run(`INSERT INTO prescription_line (prescription_id, drug_id, dose, route, frequency, duration_days, quantity, instructions) VALUES (?,?,?,?,?,?,?,?)`,
        rx.lastInsertRowid, drug.id, dose, pick(l.route, ROUTES, `Line ${i + 1} route`, 'PO'), freq, days, qty, text(l.instructions, 'Instructions', { max: 200 }));
    }
    return { no, warnings };
  });
  await audit(user, 'PRESCRIBE', 'prescription', r.no, { visit: visitNo, lines: lines.length, allergyWarnings: r.warnings.length });
  return { no: r.no, allergyWarnings: r.warnings };
}

export const listVisitPrescriptions = (visitId: number) => all<PrescriptionLine & { rx_no: string; rx_status: string; prescribed_by: string }>(
  `SELECT l.*, p.no AS rx_no, p.status AS rx_status, p.prescribed_by, d.generic_name, d.brand_name, d.strength, d.dosage_form
   FROM prescription_line l JOIN prescription p ON p.id = l.prescription_id JOIN drug d ON d.id = l.drug_id WHERE p.visit_id = ? ORDER BY p.id, l.id`, visitId,
);

/* ------------------------------------------------------------------ procedures & nursing */

export async function orderProcedure(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const svcId = optId(v.service_item_id, 'Procedure');
  const svc = svcId ? await one<{ id: number; name: string; kind: string; status: string }>('SELECT id, name, kind, status FROM service_item WHERE id = ?', svcId) : undefined;
  if (!svc || !['PROCEDURE', 'NURSING'].includes(svc.kind) || svc.status !== 'ACTIVE') throw new AppError('Pick a procedure or nursing service', 'VALIDATION');
  const qty = int(v.quantity || 1, 'Quantity', 1, 50);
  const done = String(v.performed ?? '') === '1';
  await tx(async () => {
    const visit = await openVisit(visitNo);
    const info = await run(`INSERT INTO procedure_record (visit_id, patient_id, service_item_id, description, quantity, status, notes, ordered_at, ordered_by, performed_at, performed_by)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?)`, visit.id, visit.patient_id, svc.id, svc.name, qty, done ? 'DONE' : 'ORDERED',
    text(v.notes, 'Notes', { max: 1000 }), nowIso(), user.username, done ? nowIso() : null, done ? user.username : null);
    const charge = await addCharge(visit.id, { serviceItemId: svc.id, quantity: qty, sourceType: svc.kind === 'NURSING' ? 'NURSING' : 'PROCEDURE', sourceId: info.lastInsertRowid }, user);
    await run('UPDATE procedure_record SET charge_id = ? WHERE id = ?', charge, info.lastInsertRowid);
    if (!done) await enqueue(visit.id, SERVICE_POINT.PROCEDURE);
  });
  await audit(user, 'PROCEDURE_ORDER', 'visit', visitNo, { service: svc.name, done });
}

export async function completeProcedure(id: number, notesRaw: unknown, user: Actor): Promise<void> {
  await tx(async () => {
    const p = await one<{ status: string; visit_id: number }>('SELECT status, visit_id FROM procedure_record WHERE id = ?', id);
    if (!p) throw new AppError('Procedure not found', 'NOT_FOUND');
    if (p.status !== 'ORDERED') throw new AppError('Already done or cancelled', 'VALIDATION');
    await run("UPDATE procedure_record SET status = 'DONE', performed_at = ?, performed_by = ?, notes = COALESCE(?, notes) WHERE id = ?", nowIso(), user.username, text(notesRaw, 'Notes', { max: 1000 }), id);
    if (!(await one("SELECT 1 FROM procedure_record WHERE visit_id = ? AND status = 'ORDERED'", p.visit_id))) {
      await run("UPDATE visit_queue SET status = 'DONE', completed_at = ?, served_by = ? WHERE visit_id = ? AND department_code = 'PROC' AND status IN ('WAITING','CALLED','SERVING')", nowIso(), user.username, p.visit_id);
    }
  });
  await audit(user, 'PROCEDURE_DONE', 'procedure_record', id);
}

export const listVisitProcedures = (visitId: number): Promise<ProcedureRecord[]> => all<ProcedureRecord>('SELECT * FROM procedure_record WHERE visit_id = ? ORDER BY id', visitId);

export const listProcedureWorklist = (status: 'ORDERED' | 'DONE'): Promise<ProcedureRecord[]> => all<ProcedureRecord>(
  `SELECT r.*, v.no AS visit_no, p.mrn, trim(p.first_name || ' ' || p.last_name) AS patient_name
   FROM procedure_record r JOIN visit v ON v.id = r.visit_id JOIN patient p ON p.id = r.patient_id
   WHERE r.status = ? AND (? = 'ORDERED' OR substr(r.performed_at,1,10) >= to_char(current_date - 7, 'YYYY-MM-DD')) ORDER BY r.ordered_at`, status, status,
);

/* ------------------------------------------------------------------ referrals & sick notes */

export async function issueDocument(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  const type = pick(v.doc_type, ['REFERRAL', 'SICK_NOTE', 'MEDICAL_REPORT'] as const, 'Document');
  const visit = await one<{ id: number; patient_id: number }>('SELECT id, patient_id FROM visit WHERE no = ?', visitNo);
  if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
  let from: string | null = null; let to: string | null = null;
  if (type === 'SICK_NOTE') {
    from = isoDate(v.from_date, 'From') ?? todayIso();
    to = isoDate(v.to_date, 'To')!;
    if (to < from) throw new AppError('The sick-off ends before it starts', 'VALIDATION');
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > 90) throw new AppError('A sick-off note covers at most 90 days', 'VALIDATION');
  }
  const no = await nextSequence('CLINICAL_DOCUMENT');
  await run(`INSERT INTO clinical_document (no, visit_id, patient_id, doc_type, referred_to, specialty, urgency, from_date, to_date, body, issued_at, issued_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, no, visit.id, visit.patient_id, type,
  type === 'REFERRAL' ? req(v.referred_to, 'Referred to', 160) : null, text(v.specialty, 'Specialty', { max: 80 }),
  type === 'REFERRAL' ? pick(v.urgency, ['ROUTINE', 'URGENT', 'EMERGENCY'] as const, 'Urgency', 'ROUTINE') : null,
  from, to, req(v.body, type === 'REFERRAL' ? 'Reason for referral' : 'Remarks', 6000), nowIso(), user.username);
  await audit(user, 'CLINICAL_DOCUMENT', 'clinical_document', no, { type, visit: visitNo });
  return { no };
}

export const listVisitDocuments = (visitId: number): Promise<ClinicalDocument[]> => all<ClinicalDocument>('SELECT * FROM clinical_document WHERE visit_id = ? ORDER BY id', visitId);
export const getDocument = (no: string): Promise<ClinicalDocument | undefined> => one<ClinicalDocument>('SELECT * FROM clinical_document WHERE no = ?', no);
