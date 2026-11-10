/*
 * Laboratory — the worklist from request to released report.
 *
 *   ORDERED → COLLECTED (specimen taken, accession number issued) → RESULTED (values entered,
 *   flagged against the sex-specific reference range) → VERIFIED (a second person checks and
 *   releases; the database refuses the same person doing both, and a verified result can no
 *   longer change).
 *
 * A critical value notifies the requesting clinician the moment it is entered. When the last
 * test on a visit is released the lab queue entry closes and the patient goes back to the
 * clinician's queue, whose clinician is told the results are ready.
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, nowIso, todayIso, q as qText } from '../input.ts';
import { notify } from '../notifications.ts';
import { getClinicSetup, listLabParameters } from './setup.ts';
import { enqueue } from './visits.ts';
import { AGE_SQL, NAME_SQL } from './patients.ts';
import type { Actor, LabOrderTestView, LabResultRow, LabTestParameter, Sex } from '../types.ts';

const SELECT = `
  SELECT ot.*, t.code AS test_code, t.name AS test_name, t.section, t.specimen_type, t.tat_minutes,
         o.no AS order_no, o.priority, o.ordered_at, o.ordered_by, o.clinical_notes, v.no AS visit_no,
         p.mrn, ${NAME_SQL()} AS patient_name, p.sex, ${AGE_SQL()} AS age,
         (SELECT COUNT(*)::int FROM lab_result r WHERE r.order_test_id = ot.id AND r.flag <> 'N') AS abnormal,
         (SELECT COUNT(*)::int FROM lab_result r WHERE r.order_test_id = ot.id AND r.flag IN ('LL','HH')) AS critical
  FROM lab_order_test ot JOIN lab_test t ON t.id = ot.lab_test_id JOIN lab_order o ON o.id = ot.lab_order_id
  JOIN visit v ON v.id = o.visit_id JOIN patient p ON p.id = o.patient_id`;

export type LabView = 'collect' | 'process' | 'verify' | 'done';

export async function labWorklist(view: LabView, q = ''): Promise<LabOrderTestView[]> {
  const where = view === 'collect' ? "ot.status = 'ORDERED'" : view === 'process' ? "ot.status = 'COLLECTED'"
    : view === 'verify' ? "ot.status = 'RESULTED'" : "ot.status = 'VERIFIED' AND substr(ot.verified_at,1,10) >= to_char(current_date - 14, 'YYYY-MM-DD')";
  return all<LabOrderTestView>(
    `${SELECT} WHERE ${where} AND v.status <> 'CANCELLED'
       AND (@q = '' OR o.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR ot.specimen_no ILIKE '%' || @q || '%' OR ${NAME_SQL()} ILIKE '%' || @q || '%' OR t.name ILIKE '%' || @q || '%')
     ORDER BY CASE o.priority WHEN 'STAT' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END, ${view === 'done' ? 'ot.verified_at DESC' : 'o.ordered_at'} LIMIT 500`,
    { q: qText(q) },
  );
}

export async function labCounts(): Promise<Record<LabView, number> & { overdue: number }> {
  const r = await one<{ collect: number; process: number; verify: number; done: number; overdue: number }>(
    `SELECT COUNT(*) FILTER (WHERE ot.status = 'ORDERED')::int AS collect, COUNT(*) FILTER (WHERE ot.status = 'COLLECTED')::int AS process,
            COUNT(*) FILTER (WHERE ot.status = 'RESULTED')::int AS verify,
            COUNT(*) FILTER (WHERE ot.status = 'VERIFIED' AND substr(ot.verified_at,1,10) = @t)::int AS done,
            COUNT(*) FILTER (WHERE ot.status IN ('ORDERED','COLLECTED','RESULTED') AND o.ordered_at::timestamptz + (t.tat_minutes || ' minutes')::interval < now())::int AS overdue
     FROM lab_order_test ot JOIN lab_order o ON o.id = ot.lab_order_id JOIN lab_test t ON t.id = ot.lab_test_id JOIN visit v ON v.id = o.visit_id
     WHERE v.status <> 'CANCELLED'`, { t: todayIso() },
  );
  return { collect: r?.collect ?? 0, process: r?.process ?? 0, verify: r?.verify ?? 0, done: r?.done ?? 0, overdue: r?.overdue ?? 0 };
}

export const getOrderTest = (id: number): Promise<LabOrderTestView | undefined> => one<LabOrderTestView>(`${SELECT} WHERE ot.id = @id`, { id });
export const listOrderTests = (labOrderNo: string): Promise<LabOrderTestView[]> => all<LabOrderTestView>(`${SELECT} WHERE o.no = @no ORDER BY t.section, t.name`, { no: labOrderNo });
export const listVisitLabTests = (visitId: number): Promise<LabOrderTestView[]> => all<LabOrderTestView>(`${SELECT} WHERE o.visit_id = @v ORDER BY o.id, t.section, t.name`, { v: visitId });
export const listResults = (orderTestId: number): Promise<LabResultRow[]> => all<LabResultRow>(
  'SELECT id, order_test_id, parameter_id, value_text, value_num::float AS value_num, flag FROM lab_result WHERE order_test_id = ?', orderTestId,
);

/** Patient's results across visits for one test — the trend on the chart. */
export const resultHistory = (patientId: number) => all<{ test_name: string; parameter: string; unit: string | null; value_num: number | null; value_text: string | null; flag: string; verified_at: string }>(
  `SELECT t.name AS test_name, prm.name AS parameter, prm.unit, r.value_num::float AS value_num, r.value_text, r.flag, ot.verified_at
   FROM lab_result r JOIN lab_order_test ot ON ot.id = r.order_test_id JOIN lab_order o ON o.id = ot.lab_order_id
   JOIN lab_test t ON t.id = ot.lab_test_id JOIN lab_test_parameter prm ON prm.id = r.parameter_id
   WHERE o.patient_id = ? AND ot.status = 'VERIFIED' ORDER BY ot.verified_at DESC, t.name, prm.sort_order LIMIT 300`, patientId,
);

/* ------------------------------------------------------------------ reference ranges */

export function rangeFor(p: LabTestParameter, sex: Sex): { low: number | null; high: number | null } {
  if (sex === 'FEMALE' && (p.ref_low_female != null || p.ref_high_female != null)) return { low: p.ref_low_female, high: p.ref_high_female };
  return { low: p.ref_low, high: p.ref_high };
}

export function rangeText(p: LabTestParameter, sex: Sex): string {
  if (p.ref_text) return p.ref_text;
  if (p.result_type === 'OPTION') return (p.options ?? '').split(',')[0]?.trim() ?? '';
  const { low, high } = rangeFor(p, sex);
  if (low != null && high != null) return `${low} – ${high}`;
  if (low != null) return `≥ ${low}`;
  if (high != null) return `≤ ${high}`;
  return '';
}

export function flagFor(p: LabTestParameter, sex: Sex, valueNum: number | null, valueText: string | null): string {
  if (p.result_type === 'NUMERIC' && valueNum != null) {
    if (p.critical_low != null && valueNum <= p.critical_low) return 'LL';
    if (p.critical_high != null && valueNum >= p.critical_high) return 'HH';
    const { low, high } = rangeFor(p, sex);
    if (low != null && valueNum < low) return 'L';
    if (high != null && valueNum > high) return 'H';
    return 'N';
  }
  if (p.result_type === 'OPTION' && valueText) {
    const normal = (p.options ?? '').split(',')[0]?.trim().toLowerCase();
    return normal && valueText.trim().toLowerCase() !== normal ? 'A' : 'N';
  }
  return 'N';
}

/* ------------------------------------------------------------------ the workflow */

/** Takes the specimen for one or more tests on a request; each gets its own accession number. */
export async function collectSpecimens(orderTestIds: number[], user: Actor): Promise<{ specimens: string[] }> {
  if (!orderTestIds.length) throw new AppError('Pick the tests to collect', 'VALIDATION');
  const specimens = await tx(async () => {
    const out: string[] = [];
    for (const id of orderTestIds) {
      const t = await one<{ status: string; visit_status: string }>(
        'SELECT ot.status, v.status AS visit_status FROM lab_order_test ot JOIN lab_order o ON o.id = ot.lab_order_id JOIN visit v ON v.id = o.visit_id WHERE ot.id = ?', id);
      if (!t) throw new AppError('Test not found', 'NOT_FOUND');
      if (t.status !== 'ORDERED') continue;
      if (t.visit_status === 'CANCELLED') throw new AppError('The visit was cancelled', 'VALIDATION');
      const specimen = await nextSequence('LAB_SPECIMEN');
      await run("UPDATE lab_order_test SET status = 'COLLECTED', specimen_no = ?, collected_at = ?, collected_by = ? WHERE id = ?", specimen, nowIso(), user.username, id);
      await run(`UPDATE lab_order SET status = 'IN_PROGRESS' WHERE id = (SELECT lab_order_id FROM lab_order_test WHERE id = ?) AND status = 'ORDERED'`, id);
      out.push(specimen);
    }
    return out;
  });
  await audit(user, 'LAB_COLLECT', 'lab_order_test', orderTestIds.join(','), { specimens });
  return { specimens };
}

/** Enters (or corrects, until verified) the results of one test. */
export async function enterResults(orderTestId: number, values: Record<string, unknown>, user: Actor): Promise<{ critical: string[]; autoVerified: boolean }> {
  const r = await tx(async () => {
    const t = await getOrderTest(orderTestId);
    if (!t) throw new AppError('Test not found', 'NOT_FOUND');
    if (t.status === 'ORDERED') throw new AppError('Collect the specimen first', 'VALIDATION');
    if (t.status === 'VERIFIED' || t.status === 'CANCELLED') throw new AppError('This test is closed', 'VALIDATION');
    const params = await listLabParameters(t.lab_test_id);
    if (!params.length) throw new AppError('The test has no parameters set up — add them under Clinic Setup › Lab tests', 'VALIDATION');
    const critical: string[] = [];
    let entered = 0;
    for (const p of params) {
      const raw = String(values[`p_${p.id}`] ?? '').trim();
      if (!raw) continue;
      let valueNum: number | null = null;
      let valueText: string | null = null;
      if (p.result_type === 'NUMERIC') {
        const n = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(n)) throw new AppError(`${p.name}: enter a number`, 'VALIDATION');
        valueNum = n;
      } else {
        valueText = raw.slice(0, 300);
        if (p.result_type === 'OPTION' && p.options && !p.options.split(',').map((o) => o.trim().toLowerCase()).includes(valueText.toLowerCase())) {
          throw new AppError(`${p.name}: choose one of ${p.options}`, 'VALIDATION');
        }
      }
      const flag = flagFor(p, t.sex, valueNum, valueText);
      if (flag === 'LL' || flag === 'HH') critical.push(`${p.name} ${valueNum}${p.unit ? ` ${p.unit}` : ''}`);
      await run(`INSERT INTO lab_result (order_test_id, parameter_id, value_text, value_num, flag, created_at) VALUES (?,?,?,?,?,?)
                 ON CONFLICT (order_test_id, parameter_id) DO UPDATE SET value_text = EXCLUDED.value_text, value_num = EXCLUDED.value_num, flag = EXCLUDED.flag`,
      orderTestId, p.id, valueText, valueNum, flag, nowIso());
      entered++;
    }
    if (!entered) throw new AppError('Enter at least one result', 'VALIDATION');
    await run("UPDATE lab_order_test SET status = 'RESULTED', resulted_at = ?, resulted_by = ?, comment = ? WHERE id = ?",
      nowIso(), user.username, text(values.comment, 'Comment', { max: 1000 }), orderTestId);
    const setup = await getClinicSetup();
    let autoVerified = false;
    if (!setup.lab_requires_verification) {
      // Single-person labs: the result is released as entered (the maker-checker constraint allows a NULL verifier).
      await release(orderTestId, null);
      autoVerified = true;
    }
    return { critical, autoVerified, visitNo: t.visit_no, testName: t.test_name, patient: t.patient_name };
  });
  if (r.critical.length) {
    const clinician = await one<{ clinician_user_id: number | null }>('SELECT clinician_user_id FROM visit WHERE no = ?', r.visitNo);
    if (clinician?.clinician_user_id) {
      await notify(clinician.clinician_user_id, 'LAB_CRITICAL', `CRITICAL ${r.testName} — ${r.patient}`, r.critical.join('; '), `/visits/${r.visitNo}/results`);
    }
  }
  await audit(user, 'LAB_RESULT', 'lab_order_test', orderTestId, { critical: r.critical.length });
  return { critical: r.critical, autoVerified: r.autoVerified };
}

/** Marks a resulted test verified and, when it is the visit's last outstanding lab test, sends the patient back. */
async function release(orderTestId: number, verifier: string | null): Promise<void> {
  if (verifier) await run("UPDATE lab_order_test SET status = 'VERIFIED', verified_at = ?, verified_by = ? WHERE id = ?", nowIso(), verifier, orderTestId);
  else await run("UPDATE lab_order_test SET status = 'VERIFIED', verified_at = ? WHERE id = ?", nowIso(), orderTestId);
  const o = await one<{ lab_order_id: number; visit_id: number }>(
    'SELECT ot.lab_order_id, o.visit_id FROM lab_order_test ot JOIN lab_order o ON o.id = ot.lab_order_id WHERE ot.id = ?', orderTestId);
  if (!o) return;
  if (!(await one("SELECT 1 FROM lab_order_test WHERE lab_order_id = ? AND status IN ('ORDERED','COLLECTED','RESULTED')", o.lab_order_id))) {
    await run("UPDATE lab_order SET status = 'COMPLETED' WHERE id = ?", o.lab_order_id);
  }
  const pending = await one(
    "SELECT 1 FROM lab_order_test ot JOIN lab_order lo ON lo.id = ot.lab_order_id WHERE lo.visit_id = ? AND ot.status IN ('ORDERED','COLLECTED','RESULTED')", o.visit_id);
  if (!pending) {
    await run("UPDATE visit_queue SET status = 'DONE', completed_at = ? WHERE visit_id = ? AND department_code = 'LAB' AND status IN ('WAITING','CALLED','SERVING')", nowIso(), o.visit_id);
    const v = await one<{ no: string; status: string; stage: string; department_code: string; clinician_user_id: number | null; patient: string }>(
      `SELECT v.no, v.status, v.stage, v.department_code, v.clinician_user_id, trim(p.first_name || ' ' || p.last_name) AS patient
       FROM visit v JOIN patient p ON p.id = v.patient_id WHERE v.id = ?`, o.visit_id);
    if (v && v.status === 'OPEN') {
      const otherImaging = await one("SELECT 1 FROM imaging_order WHERE visit_id = ? AND status IN ('ORDERED','PERFORMED')", o.visit_id);
      const clinic = await one<{ kind: string }>('SELECT kind FROM clinic_department WHERE code = ?', v.department_code);
      if (!otherImaging && v.stage === 'INVESTIGATION' && clinic?.kind === 'CLINIC') {
        await run("UPDATE visit SET stage = 'CONSULTATION' WHERE id = ?", o.visit_id);
        await run("UPDATE visit_queue SET status = 'WAITING', entered_at = ? WHERE visit_id = ? AND department_code = ? AND status IN ('SERVING','CALLED')", nowIso(), o.visit_id, v.department_code);
        await enqueue(o.visit_id, v.department_code);
      }
      if (v.clinician_user_id) await notify(v.clinician_user_id, 'LAB_RESULT_READY', `Lab results ready — ${v.patient}`, `Visit ${v.no}`, `/visits/${v.no}/results`);
    }
  }
}

/** Verify & release — LAB_VERIFY capability; never the person who entered the result. */
export async function verifyResults(orderTestIds: number[], user: Actor): Promise<{ verified: number }> {
  let n = 0;
  await tx(async () => {
    for (const id of orderTestIds) {
      const t = await one<{ status: string; resulted_by: string | null }>('SELECT status, resulted_by FROM lab_order_test WHERE id = ?', id);
      if (!t || t.status !== 'RESULTED') continue;
      if (t.resulted_by === user.username) throw new AppError('You entered this result — a second person must verify it', 'FORBIDDEN');
      await release(id, user.username);
      n++;
    }
  });
  if (!n) throw new AppError('Nothing to verify — the tests must be resulted first', 'VALIDATION');
  await audit(user, 'LAB_VERIFY', 'lab_order_test', orderTestIds.join(','), { verified: n });
  return { verified: n };
}

/** Sends a resulted test back for re-entry (the verifier disagrees). */
export async function rejectResult(orderTestId: number, reasonRaw: unknown, user: Actor): Promise<void> {
  const reason = text(reasonRaw, 'Reason', { required: true, max: 300 })!;
  const r = await run("UPDATE lab_order_test SET status = 'COLLECTED', comment = ? WHERE id = ? AND status = 'RESULTED'", `Returned for re-entry: ${reason}`, orderTestId);
  if (!r.changes) throw new AppError('Only a resulted, unverified test can be returned', 'VALIDATION');
  await audit(user, 'LAB_RESULT_RETURN', 'lab_order_test', orderTestId, { reason });
}

/** Everything the printed report needs for one request. */
export async function labReport(orderNo: string) {
  const tests = (await listOrderTests(orderNo)).filter((t) => t.status !== 'CANCELLED');
  if (!tests.length) return null;
  const out = [];
  for (const t of tests) {
    const params = await listLabParameters(t.lab_test_id);
    const results = new Map((await listResults(t.id)).map((r) => [r.parameter_id, r]));
    out.push({ test: t, rows: params.map((p) => ({ p, r: results.get(p.id) ?? null, range: rangeText(p, t.sex) })) });
  }
  return out;
}
