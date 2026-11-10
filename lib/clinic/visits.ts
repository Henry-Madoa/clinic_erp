/*
 * The outpatient visit (encounter) and the queues that carry the patient through the clinic.
 *
 * Check-in opens one visit per patient (a patient never has two open visits — a unique index), prices
 * it on the cash tariff or the payer's, raises the registration fee on a first visit and the
 * department's consultation fee unless it is a review inside the review window, and puts the patient
 * in the triage queue (or straight into a service point for a walk-in lab or pharmacy visit).
 *
 * Each service point keeps its own queue (visit_queue): WAITING → CALLED → SERVING → DONE. Orders
 * place the patient in the lab, imaging, pharmacy or procedure queue automatically; finishing there
 * sends them back to the clinician. Queue numbers restart every day per department (OPD-007).
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, num, int, pick, optId, isoDate, nowIso, todayIso, q as qText } from '../input.ts';
import { notify } from '../notifications.ts';
import { addCharge } from './billing.ts';
import { getClinicSetup, getDepartment } from './setup.ts';
import { AGE_SQL, NAME_SQL } from './patients.ts';
import type { Acuity, Actor, VisitPaymentMode, QueueEntry, Triage, VisitPriority, VisitStage, VisitView } from '../types.ts';

export const VISIT_STAGES: VisitStage[] = ['TRIAGE', 'CONSULTATION', 'INVESTIGATION', 'PHARMACY', 'CASHIER', 'COMPLETED'];
export const PRIORITIES: VisitPriority[] = ['ROUTINE', 'URGENT', 'EMERGENCY'];
export const OUTCOMES = ['HOME', 'FOLLOW_UP', 'REFERRED', 'ADMITTED_ELSEWHERE', 'DECEASED'] as const;
export const ACUITIES: Acuity[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];
/** The service points orders route a patient to. */
export const SERVICE_POINT: Record<string, string> = { LAB: 'LAB', IMAGING: 'RAD', PHARMACY: 'PHARM', PROCEDURE: 'PROC', CASHIER: 'CASH', TRIAGE: 'TRIAGE' };

const WAIT_SQL = (col: string): string => `GREATEST(0, (EXTRACT(EPOCH FROM (now() - ${col}::timestamptz)) / 60)::int)`;

export const VISIT_SELECT = `
  SELECT v.*, p.mrn, ${NAME_SQL()} AS patient_name, p.sex, p.date_of_birth, ${AGE_SQL()} AS age, p.phone, p.allergies, p.alerts,
         p.chronic_conditions, p.photo_url, d.name AS department_name, d.colour AS department_colour, u.full_name AS clinician_name,
         s.name AS scheme_name, s.code AS scheme_code,
         (SELECT t.acuity FROM triage t WHERE t.visit_id = v.id ORDER BY t.id DESC LIMIT 1) AS acuity,
         COALESCE((SELECT SUM(c.amount - c.discount) FROM patient_charge c WHERE c.visit_id = v.id AND c.status <> 'CANCELLED'), 0) AS charges_total,
         COALESCE((SELECT SUM(pp.amount) FROM patient_payment pp WHERE pp.visit_id = v.id AND pp.status = 'POSTED'), 0) AS paid_total,
         (SELECT q.queue_no FROM visit_queue q WHERE q.visit_id = v.id ORDER BY q.id LIMIT 1) AS queue_no,
         b.no AS bill_no, b.status AS bill_status, ${WAIT_SQL('v.check_in_at')} AS waiting_mins
  FROM visit v JOIN patient p ON p.id = v.patient_id JOIN clinic_department d ON d.code = v.department_code
  LEFT JOIN app_user u ON u.id = v.clinician_user_id LEFT JOIN insurance_scheme s ON s.id = v.scheme_id
  LEFT JOIN patient_bill b ON b.visit_id = v.id`;

export const getVisit = (no: string): Promise<VisitView | undefined> => one<VisitView>(`${VISIT_SELECT} WHERE v.no = @no`, { no });
export const getVisitById = (id: number): Promise<VisitView | undefined> => one<VisitView>(`${VISIT_SELECT} WHERE v.id = @id`, { id });
export const openVisitForPatient = (patientId: number): Promise<VisitView | undefined> => one<VisitView>(`${VISIT_SELECT} WHERE v.patient_id = @id AND v.status = 'OPEN'`, { id: patientId });

export async function listVisits(view: 'open' | 'today' | 'closed' | 'all', q = '', date?: string, department?: string): Promise<VisitView[]> {
  const where = view === 'open' ? "v.status = 'OPEN'" : view === 'today' ? 'v.visit_date = @d' : view === 'closed' ? "v.status = 'CLOSED' AND v.visit_date >= @from" : 'v.visit_date >= @from';
  return all<VisitView>(
    `${VISIT_SELECT} WHERE ${where} AND (@dept = '' OR v.department_code = @dept)
       AND (@q = '' OR v.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR ${NAME_SQL()} ILIKE '%' || @q || '%')
     ORDER BY CASE v.priority WHEN 'EMERGENCY' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END, v.check_in_at DESC LIMIT 500`,
    { d: date ?? todayIso(), from: date ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), dept: department ?? '', q: qText(q) },
  );
}

/* ------------------------------------------------------------------ queues */

async function nextQueueNo(departmentCode: string): Promise<string> {
  const dept = await getDepartment(departmentCode);
  const n = await one<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM visit_queue WHERE department_code = ? AND substr(entered_at, 1, 10) = ?', departmentCode, todayIso());
  return `${dept?.queue_prefix ?? 'Q'}-${String((n?.n ?? 0) + 1).padStart(3, '0')}`;
}

/** Puts a visit in a department's queue unless it is already waiting there. */
export async function enqueue(visitId: number, departmentCode: string, priority?: VisitPriority): Promise<void> {
  if (await one("SELECT 1 FROM visit_queue WHERE visit_id = ? AND department_code = ? AND status IN ('WAITING','CALLED','SERVING')", visitId, departmentCode)) return;
  const dept = await getDepartment(departmentCode);
  if (!dept) throw new AppError(`Department ${departmentCode} is not set up`, 'VALIDATION');
  const pr = priority ?? (await one<{ priority: VisitPriority }>('SELECT priority FROM visit WHERE id = ?', visitId))?.priority ?? 'ROUTINE';
  await run('INSERT INTO visit_queue (visit_id, department_code, queue_no, priority, room, entered_at) VALUES (?,?,?,?,?,?)',
    visitId, departmentCode, await nextQueueNo(departmentCode), pr, dept.room, nowIso());
}

/** Finishes a visit's place in one department's queue (the work there is done). */
export async function completeQueue(visitId: number, departmentCode: string, user: Actor): Promise<void> {
  await run("UPDATE visit_queue SET status = 'DONE', completed_at = ?, served_by = COALESCE(served_by, ?) WHERE visit_id = ? AND department_code = ? AND status IN ('WAITING','CALLED','SERVING')",
    nowIso(), user.username, visitId, departmentCode);
}

export async function listQueue(departmentCode: string, includeDone = false): Promise<QueueEntry[]> {
  return all<QueueEntry>(
    `SELECT q.*, v.no AS visit_no, p.mrn, ${NAME_SQL()} AS patient_name, p.sex, ${AGE_SQL()} AS age, p.alerts,
            (SELECT t.acuity FROM triage t WHERE t.visit_id = v.id ORDER BY t.id DESC LIMIT 1) AS acuity,
            v.payment_mode, s.name AS scheme_name, v.stage, ${WAIT_SQL('q.entered_at')} AS waiting_mins
     FROM visit_queue q JOIN visit v ON v.id = q.visit_id JOIN patient p ON p.id = v.patient_id LEFT JOIN insurance_scheme s ON s.id = v.scheme_id
     WHERE q.department_code = @d AND (q.status IN ('WAITING','CALLED','SERVING') OR (@done = 1 AND substr(q.entered_at,1,10) = @today))
     ORDER BY CASE q.status WHEN 'SERVING' THEN 0 WHEN 'CALLED' THEN 1 WHEN 'WAITING' THEN 2 ELSE 3 END,
              CASE q.priority WHEN 'EMERGENCY' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END,
              CASE (SELECT t.acuity FROM triage t WHERE t.visit_id = v.id ORDER BY t.id DESC LIMIT 1) WHEN 'RED' THEN 0 WHEN 'ORANGE' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END,
              q.entered_at`,
    { d: departmentCode, done: includeDone ? 1 : 0, today: todayIso() },
  );
}

/** Head-counts for every queue — the reception board and the queue display. */
export const queueCounts = (): Promise<{ code: string; name: string; colour: string; kind: string; waiting: number; serving: number; longest_mins: number }[]> => all(
  `SELECT d.code, d.name, d.colour, d.kind,
          COUNT(q.id) FILTER (WHERE q.status = 'WAITING')::int AS waiting,
          COUNT(q.id) FILTER (WHERE q.status IN ('CALLED','SERVING'))::int AS serving,
          COALESCE(MAX(${WAIT_SQL('q.entered_at')}) FILTER (WHERE q.status = 'WAITING'), 0)::int AS longest_mins
   FROM clinic_department d LEFT JOIN visit_queue q ON q.department_code = d.code AND q.status IN ('WAITING','CALLED','SERVING')
   WHERE d.status = 'ACTIVE' GROUP BY d.code, d.name, d.colour, d.kind, d.sort_order ORDER BY d.sort_order, d.name`,
);

/** What the waiting-room screen shows: who is being called where, and who is next. */
export const queueDisplay = (): Promise<{ queue_no: string; department_name: string; colour: string; room: string | null; status: string; called_at: string | null }[]> => all(
  `SELECT q.queue_no, d.name AS department_name, d.colour, COALESCE(q.room, d.room) AS room, q.status, q.called_at
   FROM visit_queue q JOIN clinic_department d ON d.code = q.department_code
   WHERE q.status IN ('CALLED','SERVING','WAITING') AND substr(q.entered_at, 1, 10) = @t
   ORDER BY CASE q.status WHEN 'CALLED' THEN 0 WHEN 'SERVING' THEN 1 ELSE 2 END, q.called_at DESC NULLS LAST, q.entered_at LIMIT 60`, { t: todayIso() },
);

export async function setQueueStatus(entryId: number, status: 'CALLED' | 'SERVING' | 'DONE' | 'SKIPPED' | 'WAITING', user: Actor, room?: string | null): Promise<void> {
  const e = await one<{ status: string; visit_id: number; department_code: string }>('SELECT status, visit_id, department_code FROM visit_queue WHERE id = ?', entryId);
  if (!e) throw new AppError('Queue entry not found', 'NOT_FOUND');
  if (e.status === 'DONE') throw new AppError('Already served', 'VALIDATION');
  const now = nowIso();
  await run(
    `UPDATE visit_queue SET status = ?, called_at = CASE WHEN ? = 'CALLED' THEN ? ELSE called_at END,
       served_by = CASE WHEN ? IN ('SERVING','DONE') THEN ? ELSE served_by END, room = COALESCE(?, room),
       completed_at = CASE WHEN ? IN ('DONE','SKIPPED') THEN ? ELSE NULL END,
       entered_at = CASE WHEN ? = 'WAITING' THEN ? ELSE entered_at END WHERE id = ?`,
    status, status, now, status, user.username, room ?? null, status, now, status, now, entryId,
  );
  await audit(user, `QUEUE_${status}`, 'visit_queue', entryId);
}

/** Calls the next patient in a department — priority and acuity first, then longest waiting. */
export async function callNext(departmentCode: string, user: Actor, room?: string | null): Promise<{ queueNo: string; visitNo: string } | null> {
  const next = (await listQueue(departmentCode)).find((e) => e.status === 'WAITING');
  if (!next) return null;
  await setQueueStatus(next.id, 'CALLED', user, room);
  return { queueNo: next.queue_no, visitNo: next.visit_no };
}

/* ------------------------------------------------------------------ check-in */

export async function checkIn(v: Record<string, unknown>, user: Actor): Promise<{ no: string; queueNo: string | null }> {
  const patientId = optId(v.patient_id, 'Patient');
  if (!patientId) throw new AppError('Pick the patient', 'VALIDATION');
  const departmentCode = String(v.department_code ?? '').trim();
  const dept = await getDepartment(departmentCode);
  if (!dept || dept.status !== 'ACTIVE') throw new AppError('Pick the clinic or service point', 'VALIDATION');
  const priority = pick(v.priority, PRIORITIES, 'Priority', 'ROUTINE');
  const mode = pick(v.payment_mode, ['CASH', 'INSURANCE', 'CORPORATE'] as VisitPaymentMode[], 'Payment mode', 'CASH');
  const directTo = pick(v.send_to, ['TRIAGE', 'DEPARTMENT'] as const, 'Send to', dept.kind === 'CLINIC' ? 'TRIAGE' : 'DEPARTMENT');
  const setup = await getClinicSetup();

  const r = await tx(async () => {
    const patient = await one<{ id: number; status: string; first_visit_date: string | null; mrn: string }>('SELECT id, status, first_visit_date, mrn FROM patient WHERE id = ?', patientId);
    if (!patient) throw new AppError('Patient not found', 'NOT_FOUND');
    if (patient.status === 'DECEASED') throw new AppError('This patient is recorded as deceased', 'VALIDATION');
    const open = await one<{ no: string }>("SELECT no FROM visit WHERE patient_id = ? AND status = 'OPEN'", patientId);
    if (open) throw new AppError(`The patient is already checked in on visit ${open.no}`, 'VALIDATION');

    let schemeId: number | null = null; let coverId: number | null = null; let memberNo: string | null = null;
    let priceList = setup.default_price_list_code;
    if (mode !== 'CASH') {
      coverId = optId(v.cover_id, 'Cover');
      const cover = coverId ? await one<{ id: number; scheme_id: number; member_no: string; status: string; valid_to: string | null; patient_id: number; price_list_code: string | null; scheme_status: string }>(
        `SELECT c.id, c.scheme_id, c.member_no, c.status, c.valid_to, c.patient_id, s.price_list_code, s.status AS scheme_status
         FROM patient_cover c JOIN insurance_scheme s ON s.id = c.scheme_id WHERE c.id = ?`, coverId) : undefined;
      if (!cover || cover.patient_id !== patientId) throw new AppError('Pick one of the patient\'s covers (add it on the patient card first)', 'VALIDATION');
      if (cover.status !== 'ACTIVE' || cover.scheme_status !== 'ACTIVE') throw new AppError('That cover is not active', 'VALIDATION');
      if (cover.valid_to && cover.valid_to < todayIso()) throw new AppError(`The cover expired on ${cover.valid_to} — check in as cash or update the cover`, 'VALIDATION');
      schemeId = cover.scheme_id; memberNo = cover.member_no; priceList = cover.price_list_code ?? priceList;
    }

    // A follow-up to the same department within the review window is a review — no consultation fee.
    const last = await one<{ visit_date: string }>(
      "SELECT visit_date FROM visit WHERE patient_id = ? AND department_code = ? AND status = 'CLOSED' ORDER BY visit_date DESC LIMIT 1", patientId, departmentCode);
    const reviewFrom = new Date(Date.now() - setup.review_window_days * 864e5).toISOString().slice(0, 10);
    const visitType = priority === 'EMERGENCY' ? 'EMERGENCY' : !patient.first_visit_date ? 'NEW' : last && last.visit_date >= reviewFrom ? 'REVIEW' : 'REVISIT';

    const no = await nextSequence('VISIT');
    const now = nowIso();
    const appointmentNo = text(v.appointment_no, 'Appointment', { max: 20 });
    const appt = appointmentNo ? await one<{ id: number; patient_id: number; status: string }>('SELECT id, patient_id, status FROM appointment WHERE no = ?', appointmentNo) : undefined;
    if (appt && appt.patient_id !== patientId) throw new AppError('That appointment is for another patient', 'VALIDATION');
    const stage: VisitStage = directTo === 'TRIAGE' ? 'TRIAGE' : dept.kind === 'CLINIC' ? 'CONSULTATION' : 'INVESTIGATION';
    const info = await run(
      `INSERT INTO visit (no, patient_id, visit_date, check_in_at, visit_type, department_code, clinician_user_id, payment_mode, scheme_id, cover_id, member_no,
         price_list_code, priority, stage, chief_complaint, appointment_id, referral_source, created_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      no, patientId, todayIso(), now, visitType, departmentCode, optId(v.clinician_user_id, 'Clinician'), mode, schemeId, coverId, memberNo,
      priceList, priority, stage, text(v.chief_complaint, 'Reason for visit', { max: 300 }), appt?.id ?? null,
      text(v.referral_source, 'Referred by', { max: 100 }), now, user.username,
    );
    const visitId = info.lastInsertRowid;
    if (appt) await run("UPDATE appointment SET status = 'ARRIVED', visit_id = ? WHERE id = ?", visitId, appt.id);
    await run('UPDATE patient SET first_visit_date = COALESCE(first_visit_date, ?), last_visit_date = ? WHERE id = ?', todayIso(), todayIso(), patientId);

    // Registration on a first visit; the clinic's consultation fee unless it is a review.
    if (visitType === 'NEW' && setup.registration_service_code) {
      const reg = await one<{ id: number }>("SELECT id FROM service_item WHERE code = ? AND status = 'ACTIVE'", setup.registration_service_code);
      if (reg) await addCharge(visitId, { serviceItemId: reg.id, sourceType: 'REGISTRATION' }, user);
    }
    if (dept.consultation_service_code && visitType !== 'REVIEW') {
      const fee = await one<{ id: number }>("SELECT id FROM service_item WHERE code = ? AND status = 'ACTIVE'", dept.consultation_service_code);
      if (fee) await addCharge(visitId, { serviceItemId: fee.id, sourceType: 'CONSULTATION' }, user);
    }
    const queueDept = directTo === 'TRIAGE' ? 'TRIAGE' : departmentCode;
    await enqueue(visitId, queueDept, priority);
    const q = await one<{ queue_no: string }>('SELECT queue_no FROM visit_queue WHERE visit_id = ? ORDER BY id DESC LIMIT 1', visitId);
    return { no, queueNo: q?.queue_no ?? null, visitType };
  });
  await audit(user, 'VISIT_CHECK_IN', 'visit', r.no, { department: departmentCode, mode, type: r.visitType });
  return { no: r.no, queueNo: r.queueNo };
}

export async function cancelVisit(no: string, reasonRaw: unknown, user: Actor): Promise<void> {
  const reason = text(reasonRaw, 'Reason', { required: true, max: 300 })!;
  await tx(async () => {
    const v = await one<{ id: number; status: string }>('SELECT id, status FROM visit WHERE no = ?', no);
    if (!v) throw new AppError('Visit not found', 'NOT_FOUND');
    if (v.status !== 'OPEN') throw new AppError('Only an open visit can be cancelled', 'VALIDATION');
    if (await one("SELECT 1 FROM patient_payment WHERE visit_id = ? AND status = 'POSTED'", v.id)) throw new AppError('Money has been received on this visit — void the receipts first', 'VALIDATION');
    if (await one("SELECT 1 FROM patient_charge WHERE visit_id = ? AND status = 'OPEN' AND source_type IN ('PHARMACY','LAB','IMAGING','PROCEDURE','DENTAL')", v.id)) {
      throw new AppError('Services have been ordered on this visit — cancel them on the bill first', 'VALIDATION');
    }
    await run("UPDATE patient_charge SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE visit_id = ? AND status = 'OPEN'", nowIso(), user.username, `Visit cancelled: ${reason}`, v.id);
    await run("UPDATE visit SET status = 'CANCELLED', stage = 'CANCELLED', outcome = NULL, closed_at = ?, closed_by = ? WHERE id = ?", nowIso(), user.username, v.id);
    await run("UPDATE visit_queue SET status = 'SKIPPED', completed_at = ? WHERE visit_id = ? AND status IN ('WAITING','CALLED','SERVING')", nowIso(), v.id);
    await run("UPDATE appointment SET status = 'BOOKED', visit_id = NULL WHERE visit_id = ?", v.id);
  });
  await audit(user, 'VISIT_CANCEL', 'visit', no, { reason });
}

/* ------------------------------------------------------------------ triage */

export const listTriage = (visitId: number): Promise<Triage[]> => all<Triage>(
  `SELECT id, visit_id, temperature_c::float AS temperature_c, pulse, resp_rate, bp_systolic, bp_diastolic, spo2, weight_kg::float AS weight_kg,
          height_cm::float AS height_cm, bmi::float AS bmi, muac_cm::float AS muac_cm, blood_sugar::float AS blood_sugar, pain_score, acuity, notes, recorded_at, recorded_by
   FROM triage WHERE visit_id = ? ORDER BY id DESC`, visitId,
);

/** An acuity floor from the vital signs — the nurse may raise it, never lower it below this. */
export function suggestedAcuity(t: { temperature_c: number | null; pulse: number | null; resp_rate: number | null; bp_systolic: number | null; spo2: number | null; pain_score: number | null }): Acuity {
  if ((t.spo2 != null && t.spo2 < 90) || (t.bp_systolic != null && t.bp_systolic < 80) || (t.resp_rate != null && t.resp_rate > 30) || (t.pulse != null && (t.pulse > 140 || t.pulse < 40))) return 'RED';
  if ((t.spo2 != null && t.spo2 < 94) || (t.temperature_c != null && t.temperature_c >= 39.5) || (t.bp_systolic != null && t.bp_systolic >= 180) || (t.pain_score != null && t.pain_score >= 8) || (t.pulse != null && t.pulse > 120)) return 'ORANGE';
  if ((t.temperature_c != null && t.temperature_c >= 38) || (t.pain_score != null && t.pain_score >= 5) || (t.bp_systolic != null && t.bp_systolic >= 160)) return 'YELLOW';
  return 'GREEN';
}
const ACUITY_RANK: Record<Acuity, number> = { RED: 0, ORANGE: 1, YELLOW: 2, GREEN: 3 };

export async function recordTriage(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ acuity: Acuity }> {
  const opt = (x: unknown, label: string, min: number, max: number, decimals = true): number | null =>
    (String(x ?? '').trim() === '' ? null : decimals ? num(x, label, min, max) : int(x, label, min, max));
  const t = {
    temperature_c: opt(v.temperature_c, 'Temperature (°C)', 25, 45), pulse: opt(v.pulse, 'Pulse', 20, 250, false), resp_rate: opt(v.resp_rate, 'Respiratory rate', 4, 80, false),
    bp_systolic: opt(v.bp_systolic, 'Systolic BP', 40, 300, false), bp_diastolic: opt(v.bp_diastolic, 'Diastolic BP', 20, 200, false), spo2: opt(v.spo2, 'SpO₂', 30, 100, false),
    weight_kg: opt(v.weight_kg, 'Weight (kg)', 0.3, 400), height_cm: opt(v.height_cm, 'Height (cm)', 20, 260), muac_cm: opt(v.muac_cm, 'MUAC (cm)', 5, 60),
    blood_sugar: opt(v.blood_sugar, 'Blood sugar (mmol/L)', 0.5, 50), pain_score: opt(v.pain_score, 'Pain score', 0, 10, false),
  };
  if (t.bp_systolic != null && t.bp_diastolic != null && t.bp_diastolic >= t.bp_systolic) throw new AppError('Diastolic pressure must be below systolic', 'VALIDATION');
  const bmi = t.weight_kg && t.height_cm ? Math.round((t.weight_kg / ((t.height_cm / 100) ** 2)) * 10) / 10 : null;
  const floor = suggestedAcuity(t);
  const chosen = pick(v.acuity, ACUITIES, 'Acuity', floor);
  const acuity = ACUITY_RANK[chosen] <= ACUITY_RANK[floor] ? chosen : floor;
  await tx(async () => {
    const visit = await one<{ id: number; status: string; department_code: string; stage: string; priority: string }>('SELECT id, status, department_code, stage, priority FROM visit WHERE no = ?', visitNo);
    if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
    if (visit.status !== 'OPEN') throw new AppError('The visit is closed', 'VALIDATION');
    await run(
      `INSERT INTO triage (visit_id, temperature_c, pulse, resp_rate, bp_systolic, bp_diastolic, spo2, weight_kg, height_cm, bmi, muac_cm, blood_sugar, pain_score, acuity, notes, recorded_at, recorded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      visit.id, t.temperature_c, t.pulse, t.resp_rate, t.bp_systolic, t.bp_diastolic, t.spo2, t.weight_kg, t.height_cm, bmi, t.muac_cm, t.blood_sugar, t.pain_score,
      acuity, text(v.notes, 'Triage notes', { max: 1000 }), nowIso(), user.username,
    );
    const priority = acuity === 'RED' ? 'EMERGENCY' : acuity === 'ORANGE' ? 'URGENT' : visit.priority;
    if (visit.stage === 'TRIAGE') {
      await completeQueue(visit.id, 'TRIAGE', user);
      await run("UPDATE visit SET stage = 'CONSULTATION', priority = ? WHERE id = ?", priority, visit.id);
      await enqueue(visit.id, visit.department_code, priority as VisitPriority);
    } else {
      await run('UPDATE visit SET priority = ? WHERE id = ?', priority, visit.id);
      await run("UPDATE visit_queue SET priority = ? WHERE visit_id = ? AND status IN ('WAITING','CALLED')", priority, visit.id);
    }
  });
  await audit(user, 'TRIAGE_RECORD', 'visit', visitNo, { acuity });
  return { acuity };
}

/* ------------------------------------------------------------------ routing & close */

/** Sends the patient on: to a service point's queue, to the cashier, or back to the clinician. */
export async function routeVisit(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const target = pick(v.target, ['CONSULTATION', 'LAB', 'IMAGING', 'PHARMACY', 'PROCEDURE', 'CASHIER'] as const, 'Send to');
  await tx(async () => {
    const visit = await one<{ id: number; status: string; department_code: string }>('SELECT id, status, department_code FROM visit WHERE no = ?', visitNo);
    if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
    if (visit.status !== 'OPEN') throw new AppError('The visit is closed', 'VALIDATION');
    const from = text(v.from_department, 'From', { max: 12 });
    if (from) await completeQueue(visit.id, from, user);
    const stage: VisitStage = target === 'CONSULTATION' ? 'CONSULTATION' : target === 'CASHIER' ? 'CASHIER' : target === 'PHARMACY' ? 'PHARMACY' : 'INVESTIGATION';
    await run('UPDATE visit SET stage = ? WHERE id = ?', stage, visit.id);
    await enqueue(visit.id, target === 'CONSULTATION' ? visit.department_code : SERVICE_POINT[target]);
  });
  await audit(user, 'VISIT_ROUTE', 'visit', visitNo, { target });
}

/** Records the outcome and follow-up; the visit then goes to the cashier for its bill. */
export async function completeVisitClinically(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const outcome = pick(v.outcome, OUTCOMES, 'Outcome', 'HOME');
  const followUp = isoDate(v.follow_up_date, 'Follow-up date', false);
  if (followUp && followUp <= todayIso()) throw new AppError('The follow-up date is in the future', 'VALIDATION');
  await tx(async () => {
    const visit = await one<{ id: number; status: string; department_code: string }>('SELECT id, status, department_code FROM visit WHERE no = ?', visitNo);
    if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
    if (visit.status !== 'OPEN') throw new AppError('The visit is closed', 'VALIDATION');
    if (!(await one('SELECT 1 FROM diagnosis WHERE visit_id = ?', visit.id)) && visit.department_code !== 'LAB' && visit.department_code !== 'PHARM') {
      throw new AppError('Record at least one diagnosis before completing the consultation', 'VALIDATION');
    }
    await run("UPDATE consultation SET status = 'COMPLETED', completed_at = COALESCE(completed_at, ?) WHERE visit_id = ? AND status = 'OPEN'", nowIso(), visit.id);
    await run('UPDATE visit SET outcome = ?, follow_up_date = ? WHERE id = ?', outcome, followUp, visit.id);
    await completeQueue(visit.id, visit.department_code, user);
    const pending = await one<{ rx: number }>(
      "SELECT COUNT(*)::int AS rx FROM prescription_line l JOIN prescription p ON p.id = l.prescription_id WHERE p.visit_id = ? AND l.status = 'PENDING'", visit.id);
    if (pending?.rx) {
      await run("UPDATE visit SET stage = 'PHARMACY' WHERE id = ?", visit.id);
      await enqueue(visit.id, 'PHARM');
    } else {
      await run("UPDATE visit SET stage = 'CASHIER' WHERE id = ?", visit.id);
      await enqueue(visit.id, 'CASH');
    }
  });
  await audit(user, 'VISIT_CLINICAL_COMPLETE', 'visit', visitNo, { outcome, followUp });
}

/** Today's patient flow: open visits by stage. */
export async function patientFlow(): Promise<Record<string, VisitView[]>> {
  const rows = await listVisits('open');
  const out: Record<string, VisitView[]> = {};
  for (const s of VISIT_STAGES) out[s] = [];
  for (const r of rows) (out[r.stage] ??= []).push(r);
  return out;
}

/** Job queue: visits left open from an earlier day — the bill is probably not finalised. */
export async function flagStaleVisits(): Promise<{ stale: number; notified: number }> {
  const stale = await all<{ no: string }>("SELECT no FROM visit WHERE status = 'OPEN' AND visit_date < ?", todayIso());
  if (!stale.length) return { stale: 0, notified: 0 };
  const managers = await all<{ id: number }>(
    "SELECT u.id FROM app_user u JOIN role r ON r.id = u.role_id WHERE u.status = 'ACTIVE' AND r.name IN ('Medical Director', 'Clinic Administrator')");
  for (const m of managers) {
    await notify(m.id, 'PATIENT_WAITING', `${stale.length} visit(s) still open from earlier days`, stale.slice(0, 8).map((s) => s.no).join(', '), '/visits/open');
  }
  return { stale: stale.length, notified: managers.length };
}
