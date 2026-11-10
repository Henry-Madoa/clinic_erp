/*
 * Dental — the odontogram and treatment plans.
 *
 * The odontogram uses FDI (ISO 3950) numbering: permanent teeth 11–48, primary teeth 51–85. A
 * finding is recorded on a tooth (and optionally its surfaces — M, O, D, B/F, L/P); a newer finding
 * on the same tooth supersedes the older one, so the chart is always the current state and the
 * history keeps every change with who recorded it and on which visit.
 *
 * A treatment plan lists procedures per tooth with the fee quoted to the patient, in phases.
 * Completing an item on a visit raises its charge at the quoted fee; cancelling the charge before
 * the bill is final puts the item back to Planned.
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, int, money, pick, optId, nowIso, todayIso } from '../input.ts';
import { addCharge } from './billing.ts';
import { priceFor } from './setup.ts';
import type { Actor, Cents, DentalChartEntry, DentalTreatmentItem, DentalTreatmentPlan } from '../types.ts';

export const ADULT_TEETH = {
  upperRight: ['18', '17', '16', '15', '14', '13', '12', '11'], upperLeft: ['21', '22', '23', '24', '25', '26', '27', '28'],
  lowerRight: ['48', '47', '46', '45', '44', '43', '42', '41'], lowerLeft: ['31', '32', '33', '34', '35', '36', '37', '38'],
};
export const PRIMARY_TEETH = {
  upperRight: ['55', '54', '53', '52', '51'], upperLeft: ['61', '62', '63', '64', '65'],
  lowerRight: ['85', '84', '83', '82', '81'], lowerLeft: ['71', '72', '73', '74', '75'],
};
const TOOTH_RE = /^([1-4][1-8]|[5-8][1-5])$/;
const SURFACES = ['M', 'O', 'D', 'B', 'L', 'I'] as const;

/** Conditions with the colour the odontogram paints them and whether they mean work is needed. */
export const DENTAL_CONDITIONS: { code: string; label: string; colour: string; needsTreatment: boolean }[] = [
  { code: 'CARIES', label: 'Caries', colour: '#dc2626', needsTreatment: true },
  { code: 'ABSCESS', label: 'Abscess / periapical lesion', colour: '#991b1b', needsTreatment: true },
  { code: 'FRACTURED', label: 'Fractured', colour: '#ea580c', needsTreatment: true },
  { code: 'EXTRACTION_NEEDED', label: 'For extraction', colour: '#b91c1c', needsTreatment: true },
  { code: 'IMPACTED', label: 'Impacted', colour: '#c2410c', needsTreatment: true },
  { code: 'MOBILE', label: 'Mobile', colour: '#d97706', needsTreatment: true },
  { code: 'FILLED', label: 'Filled / restored', colour: '#2563eb', needsTreatment: false },
  { code: 'RCT', label: 'Root canal treated', colour: '#7c3aed', needsTreatment: false },
  { code: 'CROWN', label: 'Crown', colour: '#ca8a04', needsTreatment: false },
  { code: 'BRIDGE', label: 'Bridge abutment / pontic', colour: '#a16207', needsTreatment: false },
  { code: 'IMPLANT', label: 'Implant', colour: '#0f766e', needsTreatment: false },
  { code: 'VENEER', label: 'Veneer', colour: '#0891b2', needsTreatment: false },
  { code: 'SEALANT', label: 'Fissure sealant', colour: '#16a34a', needsTreatment: false },
  { code: 'MISSING', label: 'Missing', colour: '#6b7280', needsTreatment: false },
  { code: 'HEALTHY', label: 'Sound / healthy', colour: '#22c55e', needsTreatment: false },
];
const CONDITION_CODES = DENTAL_CONDITIONS.map((c) => c.code);

/* ------------------------------------------------------------------ odontogram */

export const currentChart = (patientId: number): Promise<DentalChartEntry[]> => all<DentalChartEntry>(
  "SELECT * FROM dental_chart_entry WHERE patient_id = ? AND status = 'CURRENT' ORDER BY tooth", patientId,
);
export const chartHistory = (patientId: number): Promise<DentalChartEntry[]> => all<DentalChartEntry>(
  'SELECT * FROM dental_chart_entry WHERE patient_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 300', patientId,
);

function readSurfaces(raw: unknown): string | null {
  const s = String(Array.isArray(raw) ? raw.join('') : raw ?? '').toUpperCase().replace(/[^MODBLIFP]/g, '').replace(/F/g, 'B').replace(/P/g, 'L');
  const unique = [...new Set(s.split(''))].filter((c) => (SURFACES as readonly string[]).includes(c));
  return unique.length ? unique.join('') : null;
}

/** Records a finding on one or more teeth (the same condition on each). */
export async function recordFinding(patientId: number, v: Record<string, unknown>, user: Actor): Promise<{ teeth: number }> {
  const teeth = [...new Set(String(v.teeth ?? v.tooth ?? '').split(/[\s,;]+/).filter(Boolean))];
  if (!teeth.length) throw new AppError('Pick the tooth', 'VALIDATION');
  const bad = teeth.find((t) => !TOOTH_RE.test(t));
  if (bad) throw new AppError(`${bad} is not an FDI tooth number`, 'VALIDATION');
  const condition = pick(v.condition, CONDITION_CODES, 'Finding');
  const surfaces = readSurfaces(v.surfaces);
  const notes = text(v.notes, 'Notes', { max: 500 });
  const visitId = optId(v.visit_id, 'Visit');
  await tx(async () => {
    if (!(await one('SELECT 1 FROM patient WHERE id = ?', patientId))) throw new AppError('Patient not found', 'NOT_FOUND');
    for (const tooth of teeth) {
      await run("UPDATE dental_chart_entry SET status = 'SUPERSEDED' WHERE patient_id = ? AND tooth = ? AND status = 'CURRENT'", patientId, tooth);
      await run(`INSERT INTO dental_chart_entry (patient_id, visit_id, tooth, surfaces, condition, notes, recorded_at, recorded_by) VALUES (?,?,?,?,?,?,?,?)`,
        patientId, visitId, tooth, surfaces, condition, notes, nowIso(), user.username);
    }
  });
  await audit(user, 'DENTAL_CHART', 'patient', patientId, { teeth, condition });
  return { teeth: teeth.length };
}

/* ------------------------------------------------------------------ treatment plans */

const PLAN_SELECT = `
  SELECT pl.*, p.mrn, trim(p.first_name || ' ' || p.last_name) AS patient_name,
         COALESCE((SELECT SUM(fee) FROM dental_treatment_item i WHERE i.plan_id = pl.id AND i.status <> 'CANCELLED'), 0) AS total,
         COALESCE((SELECT SUM(fee) FROM dental_treatment_item i WHERE i.plan_id = pl.id AND i.status = 'COMPLETED'), 0) AS completed_total,
         (SELECT COUNT(*)::int FROM dental_treatment_item i WHERE i.plan_id = pl.id AND i.status <> 'CANCELLED') AS items,
         (SELECT COUNT(*)::int FROM dental_treatment_item i WHERE i.plan_id = pl.id AND i.status = 'COMPLETED') AS done
  FROM dental_treatment_plan pl JOIN patient p ON p.id = pl.patient_id`;

export const listPlans = (patientId: number): Promise<DentalTreatmentPlan[]> => all<DentalTreatmentPlan>(`${PLAN_SELECT} WHERE pl.patient_id = @id ORDER BY pl.id DESC`, { id: patientId });
export const listActivePlans = (): Promise<DentalTreatmentPlan[]> => all<DentalTreatmentPlan>(
  `${PLAN_SELECT} WHERE pl.status IN ('PROPOSED','ACCEPTED','IN_PROGRESS') ORDER BY pl.created_at DESC LIMIT 300`,
);
export const getPlan = (no: string): Promise<DentalTreatmentPlan | undefined> => one<DentalTreatmentPlan>(`${PLAN_SELECT} WHERE pl.no = @no`, { no });
export const listPlanItems = (planId: number): Promise<DentalTreatmentItem[]> => all<DentalTreatmentItem>(
  'SELECT i.*, s.code AS service_code FROM dental_treatment_item i JOIN service_item s ON s.id = i.service_item_id WHERE i.plan_id = ? ORDER BY i.phase, i.tooth NULLS LAST, i.id', planId,
);

export async function createPlan(patientId: number, v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  if (!(await one('SELECT 1 FROM patient WHERE id = ?', patientId))) throw new AppError('Patient not found', 'NOT_FOUND');
  const no = await nextSequence('DENTAL_PLAN');
  await run('INSERT INTO dental_treatment_plan (no, patient_id, visit_id, title, notes, created_at, created_by) VALUES (?,?,?,?,?,?,?)',
    no, patientId, optId(v.visit_id, 'Visit'), req(v.title, 'Plan title', 120), text(v.notes, 'Notes', { max: 2000 }), nowIso(), user.username);
  await audit(user, 'DENTAL_PLAN_CREATE', 'dental_treatment_plan', no);
  return { no };
}

/** Adds a procedure to a plan — the fee defaults to the patient's tariff for the procedure. */
export async function addPlanItem(planNo: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const plan = await one<{ id: number; patient_id: number; status: string }>('SELECT id, patient_id, status FROM dental_treatment_plan WHERE no = ?', planNo);
  if (!plan) throw new AppError('Plan not found', 'NOT_FOUND');
  if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') throw new AppError('The plan is closed', 'VALIDATION');
  const svcId = optId(v.service_item_id, 'Procedure');
  const svc = svcId ? await one<{ id: number; name: string; kind: string }>("SELECT id, name, kind FROM service_item WHERE id = ? AND status = 'ACTIVE'", svcId) : undefined;
  if (!svc || svc.kind !== 'DENTAL') throw new AppError('Pick a dental procedure', 'VALIDATION');
  const teeth = [...new Set(String(v.teeth ?? '').split(/[\s,;]+/).filter(Boolean))];
  const bad = teeth.find((t) => !TOOTH_RE.test(t));
  if (bad) throw new AppError(`${bad} is not an FDI tooth number`, 'VALIDATION');
  // The patient's usual tariff: their default cover's list, else cash.
  const list = (await one<{ code: string }>(
    `SELECT COALESCE(s.price_list_code, cs.default_price_list_code) AS code FROM clinic_setup cs
     LEFT JOIN patient_cover c ON c.patient_id = ? AND c.is_default = 1 AND c.status = 'ACTIVE' LEFT JOIN insurance_scheme s ON s.id = c.scheme_id WHERE cs.id = 1`, plan.patient_id))?.code ?? 'CASH';
  const fee: Cents = String(v.fee ?? '').trim() ? money(v.fee, 'Fee') : await priceFor(svc.id, list);
  const phase = int(v.phase || 1, 'Phase', 1, 5);
  const surfaces = readSurfaces(v.surfaces);
  const notes = text(v.notes, 'Notes', { max: 300 });
  await tx(async () => {
    for (const tooth of teeth.length ? teeth : [null]) {
      await run('INSERT INTO dental_treatment_item (plan_id, tooth, surfaces, service_item_id, description, fee, phase, notes) VALUES (?,?,?,?,?,?,?,?)',
        plan.id, tooth, surfaces, svc.id, svc.name, fee, phase, notes);
    }
  });
  await audit(user, 'DENTAL_PLAN_ITEM', 'dental_treatment_plan', planNo, { procedure: svc.name, teeth });
}

export async function setPlanStatus(planNo: string, status: 'ACCEPTED' | 'CANCELLED', user: Actor): Promise<void> {
  const plan = await one<{ id: number; status: string }>('SELECT id, status FROM dental_treatment_plan WHERE no = ?', planNo);
  if (!plan) throw new AppError('Plan not found', 'NOT_FOUND');
  if (status === 'ACCEPTED' && plan.status !== 'PROPOSED') throw new AppError('Only a proposed plan can be accepted', 'VALIDATION');
  if (status === 'CANCELLED' && (await one("SELECT 1 FROM dental_treatment_item WHERE plan_id = ? AND status = 'COMPLETED'", plan.id))) {
    throw new AppError('Work on this plan has been done — cancel the remaining items instead', 'VALIDATION');
  }
  await run('UPDATE dental_treatment_plan SET status = ?, accepted_at = CASE WHEN ? = \'ACCEPTED\' THEN ? ELSE accepted_at END WHERE id = ?', status, status, nowIso(), plan.id);
  await audit(user, `DENTAL_PLAN_${status}`, 'dental_treatment_plan', planNo);
}

/** Marks a planned procedure done on the patient's open visit and charges it at the quoted fee. */
export async function completePlanItem(itemId: number, v: Record<string, unknown>, user: Actor): Promise<void> {
  await tx(async () => {
    const item = await one<{ id: number; plan_id: number; status: string; service_item_id: number; description: string; fee: Cents; tooth: string | null; surfaces: string | null; patient_id: number; plan_status: string }>(
      `SELECT i.id, i.plan_id, i.status, i.service_item_id, i.description, i.fee, i.tooth, i.surfaces, pl.patient_id, pl.status AS plan_status
       FROM dental_treatment_item i JOIN dental_treatment_plan pl ON pl.id = i.plan_id WHERE i.id = ?`, itemId);
    if (!item) throw new AppError('Item not found', 'NOT_FOUND');
    if (item.status !== 'PLANNED') throw new AppError('Already done or cancelled', 'VALIDATION');
    if (item.plan_status === 'CANCELLED' || item.plan_status === 'COMPLETED') throw new AppError('The plan is closed', 'VALIDATION');
    const visit = await one<{ id: number }>("SELECT id FROM visit WHERE patient_id = ? AND status = 'OPEN'", item.patient_id);
    if (!visit) throw new AppError('Check the patient in first — the procedure is charged to today\'s visit', 'VALIDATION');
    const label = `${item.description}${item.tooth ? ` — tooth ${item.tooth}${item.surfaces ? ` (${item.surfaces})` : ''}` : ''}`;
    const charge = await addCharge(visit.id, { serviceItemId: item.service_item_id, sourceType: 'DENTAL', sourceId: item.id, description: label, unitPrice: Number(item.fee) }, user);
    await run("UPDATE dental_treatment_item SET status = 'COMPLETED', completed_visit_id = ?, completed_at = ?, completed_by = ?, charge_id = ?, notes = COALESCE(?, notes) WHERE id = ?",
      visit.id, nowIso(), user.username, charge, text(v.notes, 'Notes', { max: 300 }), item.id);
    // The chart follows the work: a filling paints the tooth Filled, an extraction Missing, etc.
    const after: Record<string, string> = { FILL: 'FILLED', COMP: 'FILLED', AMAL: 'FILLED', RCT: 'RCT', CROWN: 'CROWN', EXT: 'MISSING', SURGEXT: 'MISSING', IMPL: 'IMPLANT', SEAL: 'SEALANT', VEN: 'VENEER' };
    const svcCode = (await one<{ code: string }>('SELECT code FROM service_item WHERE id = ?', item.service_item_id))?.code ?? '';
    const key = Object.keys(after).find((k) => svcCode.toUpperCase().includes(k));
    if (item.tooth && key) {
      await run("UPDATE dental_chart_entry SET status = 'SUPERSEDED' WHERE patient_id = ? AND tooth = ? AND status = 'CURRENT'", item.patient_id, item.tooth);
      await run('INSERT INTO dental_chart_entry (patient_id, visit_id, tooth, surfaces, condition, notes, recorded_at, recorded_by) VALUES (?,?,?,?,?,?,?,?)',
        item.patient_id, visit.id, item.tooth, item.surfaces, after[key], `After ${item.description}`, nowIso(), user.username);
    }
    const left = await one<{ planned: number; done: number }>(
      "SELECT COUNT(*) FILTER (WHERE status = 'PLANNED')::int AS planned, COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS done FROM dental_treatment_item WHERE plan_id = ?", item.plan_id);
    await run('UPDATE dental_treatment_plan SET status = ? WHERE id = ?', left?.planned ? 'IN_PROGRESS' : 'COMPLETED', item.plan_id);
  });
  await audit(user, 'DENTAL_ITEM_DONE', 'dental_treatment_item', itemId);
}

export async function cancelPlanItem(itemId: number, user: Actor): Promise<void> {
  const r = await run("UPDATE dental_treatment_item SET status = 'CANCELLED' WHERE id = ? AND status = 'PLANNED'", itemId);
  if (!r.changes) throw new AppError('Only a planned item can be cancelled', 'VALIDATION');
  await audit(user, 'DENTAL_ITEM_CANCEL', 'dental_treatment_item', itemId);
}

/** The dental clinic's day: who is in, waiting, or booked. */
export async function dentalDay(date = todayIso()) {
  return all<{ visit_no: string | null; mrn: string; patient_name: string; status: string; time: string | null; source: string; plan_no: string | null }>(
    `SELECT v.no AS visit_no, p.mrn, trim(p.first_name || ' ' || p.last_name) AS patient_name, v.stage AS status, substr(v.check_in_at, 12, 5) AS time, 'VISIT' AS source,
            (SELECT pl.no FROM dental_treatment_plan pl WHERE pl.patient_id = p.id AND pl.status IN ('ACCEPTED','IN_PROGRESS') ORDER BY pl.id DESC LIMIT 1) AS plan_no
     FROM visit v JOIN patient p ON p.id = v.patient_id WHERE v.department_code = 'DENTAL' AND v.visit_date = @d AND v.status <> 'CANCELLED'
     UNION ALL
     SELECT NULL, p.mrn, trim(p.first_name || ' ' || p.last_name), a.status, a.start_time, 'APPOINTMENT', NULL
     FROM appointment a JOIN patient p ON p.id = a.patient_id WHERE a.department_code = 'DENTAL' AND a.appointment_date = @d AND a.status IN ('BOOKED','CONFIRMED')
     ORDER BY time NULLS LAST`, { d: date },
  );
}
