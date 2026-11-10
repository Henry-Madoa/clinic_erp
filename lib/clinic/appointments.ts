/*
 * Appointments — booking, the day sheet per clinic and clinician, SMS reminders and no-shows.
 *
 * A booking takes a slot in a department (and optionally with a clinician). The same clinician
 * cannot be double-booked and the same patient cannot hold two bookings that overlap. Checking in
 * against a booking marks it Arrived (lib/clinic/visits.ts); the nightly sweep marks the rest of
 * yesterday's bookings No-show. Reminders go out once through the message outbox to patients who
 * have consented to SMS.
 */
import { one, all, run, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, int, pick, optId, isoDate, nowIso, todayIso, q as qText } from '../input.ts';
import { addDays } from '../dateFormula.ts';
import { sendSms } from '../sms.ts';
import { getOrgBrand } from '../org.ts';
import { getClinicSetup } from './setup.ts';
import { NAME_SQL } from './patients.ts';
import type { Actor, Appointment, AppointmentStatus } from '../types.ts';

export const APPOINTMENT_TYPES = ['NEW', 'REVIEW', 'PROCEDURE', 'DENTAL', 'LAB', 'VACCINATION'] as const;
export const APPOINTMENT_SOURCES = ['PHONE', 'WALK_IN', 'ONLINE', 'FOLLOW_UP'] as const;
const OPEN_APPOINTMENT: AppointmentStatus[] = ['BOOKED', 'CONFIRMED'];

const SELECT = `
  SELECT a.*, ${NAME_SQL()} AS patient_name, p.mrn, p.phone, d.name AS department_name, d.colour AS department_colour,
         u.full_name AS clinician_name, v.no AS visit_no
  FROM appointment a JOIN patient p ON p.id = a.patient_id JOIN clinic_department d ON d.code = a.department_code
  LEFT JOIN app_user u ON u.id = a.clinician_user_id LEFT JOIN visit v ON v.id = a.visit_id`;

export async function listAppointments(opts: { from: string; to: string; department?: string; clinicianId?: number | null; q?: string; status?: string }): Promise<Appointment[]> {
  return all<Appointment>(
    `${SELECT} WHERE a.appointment_date BETWEEN @from AND @to AND (@dept = '' OR a.department_code = @dept)
       AND (@clin = 0 OR a.clinician_user_id = @clin) AND (@status = '' OR a.status = @status)
       AND (@q = '' OR a.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR ${NAME_SQL()} ILIKE '%' || @q || '%' OR p.phone ILIKE '%' || @q || '%')
     ORDER BY a.appointment_date, a.start_time LIMIT 1000`,
    { from: opts.from, to: opts.to, dept: opts.department ?? '', clin: opts.clinicianId ?? 0, q: qText(opts.q), status: opts.status ?? '' },
  );
}

const getAppointment = (no: string): Promise<Appointment | undefined> => one<Appointment>(`${SELECT} WHERE a.no = @no`, { no });
export const upcomingForPatient = (patientId: number): Promise<Appointment[]> => all<Appointment>(
  `${SELECT} WHERE a.patient_id = @id AND a.appointment_date >= @t AND a.status IN ('BOOKED','CONFIRMED') ORDER BY a.appointment_date, a.start_time`, { id: patientId, t: todayIso() },
);

const toMins = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function assertNoClash(date: string, start: string, duration: number, patientId: number, clinicianId: number | null, exceptId = 0): Promise<void> {
  const s = toMins(start); const e = s + duration;
  const overlapping = await all<{ no: string; patient_id: number; clinician_user_id: number | null; start_time: string; duration_mins: number }>(
    "SELECT no, patient_id, clinician_user_id, start_time, duration_mins FROM appointment WHERE appointment_date = ? AND status IN ('BOOKED','CONFIRMED','ARRIVED') AND id <> ?", date, exceptId);
  for (const a of overlapping) {
    const as = toMins(a.start_time); const ae = as + a.duration_mins;
    if (s < ae && as < e) {
      if (a.patient_id === patientId) throw new AppError(`The patient already has ${a.no} at ${a.start_time} that day`, 'VALIDATION');
      if (clinicianId && a.clinician_user_id === clinicianId) throw new AppError(`The clinician is booked at ${a.start_time} (${a.no})`, 'VALIDATION');
    }
  }
}

function readSlot(v: Record<string, unknown>, setup: { day_start: string; day_end: string; slot_minutes: number }): { date: string; start: string; duration: number } {
  const date = isoDate(v.appointment_date, 'Date')!;
  const start = String(v.start_time ?? '').trim();
  if (!/^\d{2}:\d{2}$/.test(start)) throw new AppError('Pick the time', 'VALIDATION');
  const duration = int(v.duration_mins || setup.slot_minutes, 'Duration', 5, 480);
  if (start < setup.day_start || toHhmm(toMins(start) + duration) > setup.day_end) throw new AppError(`The clinic books between ${setup.day_start} and ${setup.day_end}`, 'VALIDATION');
  return { date, start, duration };
}

export async function bookAppointment(v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  const setup = await getClinicSetup();
  const patientId = optId(v.patient_id, 'Patient');
  if (!patientId || !(await one("SELECT 1 FROM patient WHERE id = ? AND status = 'ACTIVE'", patientId))) throw new AppError('Pick an active patient', 'VALIDATION');
  const dept = String(v.department_code ?? '');
  if (!(await one("SELECT 1 FROM clinic_department WHERE code = ? AND status = 'ACTIVE'", dept))) throw new AppError('Pick the clinic', 'VALIDATION');
  const { date, start, duration } = readSlot(v, setup);
  if (date < todayIso()) throw new AppError('The date is in the past', 'VALIDATION');
  const clinician = optId(v.clinician_user_id, 'Clinician');
  await assertNoClash(date, start, duration, patientId, clinician);
  const no = await nextSequence('APPOINTMENT');
  await run(`INSERT INTO appointment (no, patient_id, department_code, clinician_user_id, appointment_date, start_time, duration_mins, appointment_type, reason, source, created_at, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, no, patientId, dept, clinician, date, start, duration,
  pick(v.appointment_type, APPOINTMENT_TYPES, 'Type', 'NEW'), text(v.reason, 'Reason', { max: 300 }), pick(v.source, APPOINTMENT_SOURCES, 'Source', 'PHONE'), nowIso(), user.username);
  await audit(user, 'APPOINTMENT_BOOK', 'appointment', no, { date, start });
  return { no };
}

export async function rescheduleAppointment(no: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const a = await getAppointment(no);
  if (!a) throw new AppError('Appointment not found', 'NOT_FOUND');
  if (!OPEN_APPOINTMENT.includes(a.status)) throw new AppError('Only a booked appointment can be moved', 'VALIDATION');
  const setup = await getClinicSetup();
  const { date, start, duration } = readSlot(v, setup);
  if (date < todayIso()) throw new AppError('The date is in the past', 'VALIDATION');
  const clinician = optId(v.clinician_user_id, 'Clinician');
  await assertNoClash(date, start, duration, a.patient_id, clinician, a.id);
  await run("UPDATE appointment SET appointment_date = ?, start_time = ?, duration_mins = ?, clinician_user_id = ?, status = 'BOOKED', reminder_sent_at = NULL WHERE id = ?",
    date, start, duration, clinician, a.id);
  await audit(user, 'APPOINTMENT_MOVE', 'appointment', no, { from: `${a.appointment_date} ${a.start_time}`, to: `${date} ${start}` });
}

export async function setAppointmentStatus(no: string, status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW', reasonRaw: unknown, user: Actor): Promise<void> {
  const a = await getAppointment(no);
  if (!a) throw new AppError('Appointment not found', 'NOT_FOUND');
  if (!OPEN_APPOINTMENT.includes(a.status)) throw new AppError('This appointment is no longer open', 'VALIDATION');
  const reason = status === 'CANCELLED' ? text(reasonRaw, 'Reason', { required: true, max: 300 }) : null;
  await run('UPDATE appointment SET status = ?, cancel_reason = ? WHERE id = ?', status, reason, a.id);
  await audit(user, `APPOINTMENT_${status}`, 'appointment', no, reason ? { reason } : undefined);
}

/** A follow-up booked from the visit itself (the outcome's follow-up date). */
export async function bookFollowUp(visitNo: string, v: Record<string, unknown>, user: Actor): Promise<{ no: string }> {
  const visit = await one<{ patient_id: number; department_code: string; clinician_user_id: number | null }>('SELECT patient_id, department_code, clinician_user_id FROM visit WHERE no = ?', visitNo);
  if (!visit) throw new AppError('Visit not found', 'NOT_FOUND');
  return bookAppointment({ ...v, patient_id: visit.patient_id, department_code: v.department_code || visit.department_code,
    clinician_user_id: v.clinician_user_id ?? visit.clinician_user_id, appointment_type: v.appointment_type || 'REVIEW', source: 'FOLLOW_UP' }, user);
}

export async function appointmentStats(date = todayIso()): Promise<{ booked: number; arrived: number; noShow: number; cancelled: number; upcoming7: number }> {
  const r = await one<{ booked: number; arrived: number; no_show: number; cancelled: number; upcoming7: number }>(
    `SELECT COUNT(*) FILTER (WHERE appointment_date = @d AND status IN ('BOOKED','CONFIRMED'))::int AS booked,
            COUNT(*) FILTER (WHERE appointment_date = @d AND status IN ('ARRIVED','COMPLETED'))::int AS arrived,
            COUNT(*) FILTER (WHERE appointment_date = @d AND status = 'NO_SHOW')::int AS no_show,
            COUNT(*) FILTER (WHERE appointment_date = @d AND status = 'CANCELLED')::int AS cancelled,
            COUNT(*) FILTER (WHERE appointment_date > @d AND appointment_date <= @to AND status IN ('BOOKED','CONFIRMED'))::int AS upcoming7
     FROM appointment`, { d: date, to: addDays(date, 7) },
  );
  return { booked: r?.booked ?? 0, arrived: r?.arrived ?? 0, noShow: r?.no_show ?? 0, cancelled: r?.cancelled ?? 0, upcoming7: r?.upcoming7 ?? 0 };
}

/* ------------------------------------------------------------------ jobs */

/** SMS reminders for bookings inside the reminder window — sent once each. */
export async function sendAppointmentReminders(): Promise<{ queued: number; skipped: number }> {
  const setup = await getClinicSetup();
  const until = addDays(todayIso(), Math.max(1, Math.ceil(setup.reminder_hours / 24)));
  const due = await all<Appointment & { sms_consent: number; first_name: string }>(
    `${SELECT.replace('SELECT a.*', 'SELECT a.*, p.sms_consent, p.first_name')} WHERE a.status IN ('BOOKED','CONFIRMED') AND a.reminder_sent_at IS NULL
       AND a.appointment_date > @t AND a.appointment_date <= @until`, { t: todayIso(), until },
  );
  const org = await getOrgBrand();
  const clinic = org?.short_name || org?.name || 'the clinic';
  let queued = 0; let skipped = 0;
  for (const a of due) {
    if (!a.phone || !a.sms_consent) { skipped++; continue; }
    await sendSms({
      to: a.phone, reference: { type: 'APPOINTMENT', no: a.no },
      message: `Hello ${a.first_name}, a reminder of your ${a.department_name} appointment at ${clinic} on ${a.appointment_date} at ${a.start_time}. Ref ${a.no}. Reply or call to reschedule.`,
    });
    await run('UPDATE appointment SET reminder_sent_at = ? WHERE id = ?', nowIso(), a.id);
    queued++;
  }
  return { queued, skipped };
}

/** Bookings from before today nobody arrived for. */
export async function markNoShows(user: Actor): Promise<number> {
  const r = await run("UPDATE appointment SET status = 'NO_SHOW' WHERE appointment_date < ? AND status IN ('BOOKED','CONFIRMED')", todayIso());
  if (r.changes) await audit(user, 'APPOINTMENT_NO_SHOW_SWEEP', 'appointment', null, { count: r.changes });
  return r.changes;
}
