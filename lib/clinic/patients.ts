/*
 * The patient register.
 *
 * A patient is registered once and keeps one MRN for life. The national ID (or passport / birth
 * certificate number) is sealed with AES-256-GCM at rest and shown masked; revealing it needs its
 * own capability and is written to the audit trail. Registration refuses an obvious duplicate —
 * the same phone with the same name and date of birth — so one person does not end up with two
 * charts. Scheme memberships (covers) hang off the patient; one may be the default the front desk
 * proposes at check-in.
 */
import { one, all, run, tx, nextSequence, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, pick, flag, optId, email, isoDate, q as qText, nowIso, todayIso } from '../input.ts';
import { encryptField, decryptField, lastFour, maskTail } from '../fieldCrypto.ts';
import { buildFilterClause, codeOptions, type FilterCondition, type FilterFieldDef } from '../listFilters.ts';
import { isPhone } from '../validate.ts';
import type { Actor, Patient, PatientCover, PatientListRow, Sex } from '../types.ts';

export const SEXES: Sex[] = ['FEMALE', 'MALE', 'INTERSEX'];
export const ID_TYPES = ['NATIONAL_ID', 'PASSPORT', 'BIRTH_CERTIFICATE', 'ALIEN_ID', 'NONE'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const RELATIONSHIPS = ['SELF', 'SPOUSE', 'CHILD', 'DEPENDANT'] as const;

/** SQL for a patient's age in whole years from date_of_birth (NULL when unknown). */
export const AGE_SQL = (alias = 'p'): string =>
  `CASE WHEN ${alias}.date_of_birth IS NULL THEN NULL ELSE date_part('year', age(current_date, ${alias}.date_of_birth::date))::int END`;
export const NAME_SQL = (alias = 'p'): string =>
  `trim(${alias}.first_name || ' ' || COALESCE(${alias}.middle_name || ' ', '') || ${alias}.last_name)`;

const LIST_SELECT = `
  SELECT p.*, ${NAME_SQL()} AS full_name, ${AGE_SQL()} AS age,
         (SELECT COUNT(*)::int FROM visit v WHERE v.patient_id = p.id AND v.status <> 'CANCELLED') AS visits,
         (SELECT v.no FROM visit v WHERE v.patient_id = p.id AND v.status = 'OPEN' LIMIT 1) AS open_visit_no,
         (SELECT s.name FROM patient_cover c JOIN insurance_scheme s ON s.id = c.scheme_id
            WHERE c.patient_id = p.id AND c.is_default = 1 AND c.status = 'ACTIVE' LIMIT 1) AS default_scheme
  FROM patient p`;

export const PATIENT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'mrn', label: 'MRN', type: 'text', column: 'p.mrn' },
  { key: 'last_name', label: 'Surname', type: 'text', column: 'p.last_name' },
  { key: 'phone', label: 'Phone', type: 'text', column: 'p.phone' },
  { key: 'sex', label: 'Sex', type: 'select', column: 'p.sex', options: codeOptions(...SEXES) },
  { key: 'status', label: 'Status', type: 'select', column: 'p.status', options: codeOptions('ACTIVE', 'INACTIVE', 'DECEASED') },
  { key: 'last_visit_date', label: 'Last visit', type: 'date', column: 'p.last_visit_date' },
  { key: 'created_at', label: 'Registered', type: 'date', column: 'p.created_at', datetime: true },
];

/** Search by MRN, name (any order), phone or the last four of the ID number. */
export async function listPatients(q = '', filters: FilterCondition[] = [], limit = 200): Promise<PatientListRow[]> {
  const { clause, params } = buildFilterClause(PATIENT_FILTER_FIELDS, filters);
  const term = qText(q);
  const words = term.split(/\s+/).filter(Boolean).slice(0, 3);
  const nameClause = words.map((_, i) => `${NAME_SQL()} ILIKE '%' || @w${i} || '%'`).join(' AND ') || 'TRUE';
  const wordParams = Object.fromEntries(words.map((w, i) => [`w${i}`, w]));
  return all<PatientListRow>(
    `${LIST_SELECT} WHERE (@q = '' OR p.mrn ILIKE @q || '%' OR regexp_replace(COALESCE(p.phone,''), '\\D', '', 'g') LIKE '%' || regexp_replace(@q, '\\D', '', 'g') || '%' AND length(regexp_replace(@q, '\\D', '', 'g')) >= 4
       OR p.id_number_last4 = @q OR (${nameClause})) ${clause}
     ORDER BY COALESCE(p.last_visit_date, substr(p.created_at, 1, 10)) DESC, p.id DESC LIMIT ${Math.min(limit, 1000)}`,
    { q: term, ...wordParams, ...params },
  );
}

export const getPatient = (mrn: string): Promise<PatientListRow | undefined> => one<PatientListRow>(`${LIST_SELECT} WHERE p.mrn = @mrn`, { mrn });
export const getPatientById = (id: number): Promise<PatientListRow | undefined> => one<PatientListRow>(`${LIST_SELECT} WHERE p.id = @id`, { id });

export async function patientCounts(): Promise<{ total: number; newToday: number; newMonth: number }> {
  const r = await one<{ total: number; today: number; month: number }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE substr(created_at,1,10) = @d)::int AS today,
            COUNT(*) FILTER (WHERE substr(created_at,1,7) = substr(@d,1,7))::int AS month FROM patient`, { d: todayIso() },
  );
  return { total: r?.total ?? 0, newToday: r?.today ?? 0, newMonth: r?.month ?? 0 };
}

/* ------------------------------------------------------------------ register & edit */

interface PatientValues {
  title: string | null; first_name: string; middle_name: string | null; last_name: string; sex: Sex; date_of_birth: string | null;
  dob_estimated: 0 | 1; marital_status: string | null; id_type: string; phone: string | null; alt_phone: string | null; email: string | null;
  address: string | null; county_code: string | null; occupation: string | null; blood_group: string | null; allergies: string | null;
  chronic_conditions: string | null; alerts: string | null; next_of_kin_name: string | null; next_of_kin_relation: string | null;
  next_of_kin_phone: string | null; sms_consent: 0 | 1; notes: string | null;
}

function phone(v: unknown, label: string): string | null {
  const t = text(v, label, { max: 30 });
  if (t && !isPhone(t)) throw new AppError(`${label} is not a valid phone number`, 'VALIDATION');
  return t;
}

function readPatient(v: Record<string, unknown>): PatientValues {
  const properName = (x: unknown, label: string, required: boolean): string | null => {
    const t = required ? req(x, label, 60) : text(x, label, { max: 60 });
    return t ? t.replace(/\s+/g, ' ').replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase()) : null;
  };
  let dob = isoDate(v.date_of_birth, 'Date of birth', false);
  let estimated: 0 | 1 = 0;
  if (!dob && String(v.age_years ?? '').trim()) {
    const years = Number(v.age_years);
    if (!Number.isInteger(years) || years < 0 || years > 120) throw new AppError('Age is a whole number of years', 'VALIDATION');
    dob = `${new Date().getFullYear() - years}-07-01`;
    estimated = 1;
  }
  if (dob && dob > todayIso()) throw new AppError('Date of birth cannot be in the future', 'VALIDATION');
  const blood = text(v.blood_group, 'Blood group', { max: 3 });
  if (blood && !(BLOOD_GROUPS as readonly string[]).includes(blood)) throw new AppError('Unknown blood group', 'VALIDATION');
  return {
    title: text(v.title, 'Title', { max: 10 }), first_name: properName(v.first_name, 'First name', true)!,
    middle_name: properName(v.middle_name, 'Middle name', false), last_name: properName(v.last_name, 'Surname', true)!,
    sex: pick(v.sex, SEXES, 'Sex'), date_of_birth: dob, dob_estimated: flag(v.dob_estimated) || estimated,
    marital_status: text(v.marital_status, 'Marital status', { max: 20 }), id_type: pick(v.id_type, ID_TYPES, 'ID type', 'NATIONAL_ID'),
    phone: phone(v.phone, 'Phone'), alt_phone: phone(v.alt_phone, 'Alternative phone'), email: email(v.email),
    address: text(v.address, 'Address', { max: 200 }), county_code: text(v.county_code, 'County', { max: 5 }),
    occupation: text(v.occupation, 'Occupation', { max: 60 }), blood_group: blood,
    allergies: text(v.allergies, 'Allergies', { max: 500 }), chronic_conditions: text(v.chronic_conditions, 'Chronic conditions', { max: 500 }),
    alerts: text(v.alerts, 'Clinical alerts', { max: 300 }), next_of_kin_name: text(v.next_of_kin_name, 'Next of kin', { max: 100 }),
    next_of_kin_relation: text(v.next_of_kin_relation, 'Relationship', { max: 30 }), next_of_kin_phone: phone(v.next_of_kin_phone, 'Next of kin phone'),
    sms_consent: String(v.sms_consent ?? '1') === '' ? 0 : flag(v.sms_consent ?? '1'), notes: text(v.notes, 'Notes', { max: 1000 }),
  };
}

const COLS: (keyof PatientValues)[] = [
  'title', 'first_name', 'middle_name', 'last_name', 'sex', 'date_of_birth', 'dob_estimated', 'marital_status', 'id_type', 'phone', 'alt_phone', 'email',
  'address', 'county_code', 'occupation', 'blood_group', 'allergies', 'chronic_conditions', 'alerts', 'next_of_kin_name', 'next_of_kin_relation',
  'next_of_kin_phone', 'sms_consent', 'notes',
];

/** Same phone, same surname and the same date of birth (or first name) — almost certainly the same person. */
async function findDuplicate(p: PatientValues, idNumber: string | null, exceptId = 0): Promise<{ mrn: string } | undefined> {
  if (idNumber) {
    const last4 = lastFour(idNumber);
    const candidates = await all<{ id: number; mrn: string; id_number_enc: string | null }>(
      'SELECT id, mrn, id_number_enc FROM patient WHERE id_number_last4 = ? AND id <> ?', last4, exceptId);
    for (const c of candidates) if (decryptField(c.id_number_enc) === idNumber) return { mrn: c.mrn };
  }
  if (!p.phone) return undefined;
  return one<{ mrn: string }>(
    `SELECT mrn FROM patient WHERE id <> @id AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = regexp_replace(@phone, '\\D', '', 'g')
       AND lower(last_name) = lower(@last) AND (date_of_birth = @dob OR lower(first_name) = lower(@first)) LIMIT 1`,
    { id: exceptId, phone: p.phone, last: p.last_name, dob: p.date_of_birth, first: p.first_name },
  );
}

export async function registerPatient(v: Record<string, unknown>, user: Actor): Promise<{ mrn: string; id: number }> {
  const p = readPatient(v);
  const idNumber = text(v.id_number, 'ID number', { max: 30 })?.toUpperCase().replace(/\s+/g, '') ?? null;
  const dup = await findDuplicate(p, idNumber);
  if (dup && !flag(v.confirm_not_duplicate)) {
    throw new AppError(`This looks like patient ${dup.mrn} already on the register. Open that chart, or tick "not a duplicate" to register anyway.`, 'VALIDATION');
  }
  return tx(async () => {
    const mrn = await nextSequence('PATIENT');
    const info = await run(
      `INSERT INTO patient (mrn, ${COLS.join(', ')}, id_number_enc, id_number_last4, created_at, created_by)
       VALUES (?, ${COLS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
      mrn, ...COLS.map((c) => p[c]), encryptField(idNumber), lastFour(idNumber), nowIso(), user.username,
    );
    const schemeId = optId(v.scheme_id, 'Scheme');
    if (schemeId) {
      await addCover(info.lastInsertRowid, { scheme_id: schemeId, member_no: v.member_no, principal_name: v.principal_name, relationship: v.relationship, valid_to: v.valid_to, is_default: 1 }, user);
    }
    await audit(user, 'PATIENT_REGISTER', 'patient', mrn, { sex: p.sex });
    return { mrn, id: info.lastInsertRowid };
  });
}

export async function updatePatient(mrn: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const before = await one<{ id: number }>('SELECT id FROM patient WHERE mrn = ?', mrn);
  if (!before) throw new AppError('Patient not found', 'NOT_FOUND');
  const p = readPatient(v);
  const status = pick(v.status, ['ACTIVE', 'INACTIVE', 'DECEASED'] as const, 'Status', 'ACTIVE');
  const idNumber = text(v.id_number, 'ID number', { max: 30 })?.toUpperCase().replace(/\s+/g, '') ?? null;
  const dup = await findDuplicate(p, idNumber, before.id);
  if (dup && idNumber) throw new AppError(`That ID number belongs to patient ${dup.mrn}`, 'VALIDATION');
  await run(
    `UPDATE patient SET ${COLS.map((c) => `${c} = ?`).join(', ')}, status = ?, updated_at = ?, updated_by = ? ${idNumber ? ', id_number_enc = ?, id_number_last4 = ?' : ''} WHERE id = ?`,
    ...COLS.map((c) => p[c]), status, nowIso(), user.username, ...(idNumber ? [encryptField(idNumber), lastFour(idNumber)] : []), before.id,
  );
  await audit(user, 'PATIENT_UPDATE', 'patient', mrn, idNumber ? { idNumberChanged: true } : undefined);
}

export async function setPatientPhoto(mrn: string, url: string | null, user: Actor): Promise<void> {
  if (url && !/^https:\/\/res\.cloudinary\.com\//.test(url)) throw new AppError('Photos are uploaded to the media store', 'VALIDATION');
  await run('UPDATE patient SET photo_url = ?, updated_at = ?, updated_by = ? WHERE mrn = ?', url, nowIso(), user.username, mrn);
  await audit(user, 'PATIENT_PHOTO', 'patient', mrn);
}

export const maskedIdNumber = (p: Pick<Patient, 'id_number_last4'>): string | null => maskTail(p.id_number_last4);

/** The full ID number — the caller has checked PATIENTS_PII_VIEW; every reveal is audited. */
export async function revealIdNumber(mrn: string, user: Actor): Promise<string | null> {
  const r = await one<{ id_number_enc: string | null }>('SELECT id_number_enc FROM patient WHERE mrn = ?', mrn);
  if (!r) throw new AppError('Patient not found', 'NOT_FOUND');
  await audit(user, 'PATIENT_ID_REVEAL', 'patient', mrn);
  return decryptField(r.id_number_enc);
}

/* ------------------------------------------------------------------ covers */

export const listCovers = (patientId: number): Promise<PatientCover[]> => all<PatientCover>(
  `SELECT c.*, s.name AS scheme_name, s.code AS scheme_code, s.payer_type FROM patient_cover c JOIN insurance_scheme s ON s.id = c.scheme_id
   WHERE c.patient_id = ? ORDER BY c.status, c.is_default DESC, c.id DESC`, patientId,
);

export async function addCover(patientId: number, v: Record<string, unknown>, user: Actor): Promise<void> {
  const schemeId = optId(v.scheme_id, 'Scheme');
  if (!schemeId || !(await one("SELECT 1 FROM insurance_scheme WHERE id = ? AND status = 'ACTIVE'", schemeId))) throw new AppError('Pick an active scheme', 'VALIDATION');
  const member = req(v.member_no, 'Member no.', 40).toUpperCase();
  if (await one("SELECT 1 FROM patient_cover WHERE scheme_id = ? AND upper(member_no) = ? AND patient_id <> ? AND status = 'ACTIVE' AND relationship = 'SELF'", schemeId, member, patientId)
      && pick(v.relationship, RELATIONSHIPS, 'Relationship', 'SELF') === 'SELF') {
    throw new AppError('That member number is already the principal member on another patient', 'VALIDATION');
  }
  const isDefault = flag(v.is_default);
  await tx(async () => {
    if (isDefault) await run('UPDATE patient_cover SET is_default = 0 WHERE patient_id = ?', patientId);
    await run(`INSERT INTO patient_cover (patient_id, scheme_id, member_no, principal_name, relationship, valid_from, valid_to, is_default, created_at, created_by)
               VALUES (?,?,?,?,?,?,?,?,?,?)`, patientId, schemeId, member, text(v.principal_name, 'Principal', { max: 100 }),
    pick(v.relationship, RELATIONSHIPS, 'Relationship', 'SELF'), isoDate(v.valid_from, 'Valid from', false), isoDate(v.valid_to, 'Valid to', false),
    isDefault, nowIso(), user.username);
  });
  await audit(user, 'PATIENT_COVER_ADD', 'patient', patientId, { schemeId, member });
}

export async function endCover(coverId: number, user: Actor): Promise<void> {
  await run("UPDATE patient_cover SET status = 'ENDED', is_default = 0 WHERE id = ?", coverId);
  await audit(user, 'PATIENT_COVER_END', 'patient_cover', coverId);
}

export async function makeDefaultCover(coverId: number, user: Actor): Promise<void> {
  const c = await one<{ patient_id: number; status: string }>('SELECT patient_id, status FROM patient_cover WHERE id = ?', coverId);
  if (!c || c.status !== 'ACTIVE') throw new AppError('Only an active cover can be the default', 'VALIDATION');
  await tx(async () => {
    await run('UPDATE patient_cover SET is_default = 0 WHERE patient_id = ?', c.patient_id);
    await run('UPDATE patient_cover SET is_default = 1 WHERE id = ?', coverId);
  });
  await audit(user, 'PATIENT_COVER_DEFAULT', 'patient_cover', coverId);
}

/* ------------------------------------------------------------------ the chart */

export interface PatientTimelineRow {
  id: number; no: string; visit_date: string; department_name: string; department_colour: string; status: string; stage: string;
  payment_mode: string; scheme_name: string | null; clinician_name: string | null; diagnoses: string | null; net: number | null; outcome: string | null;
}

export const patientTimeline = (patientId: number): Promise<PatientTimelineRow[]> => all<PatientTimelineRow>(
  `SELECT v.id, v.no, v.visit_date, d.name AS department_name, d.colour AS department_colour, v.status, v.stage, v.payment_mode,
          s.name AS scheme_name, u.full_name AS clinician_name, v.outcome,
          (SELECT string_agg(COALESCE(dx.icd_code || ' ', '') || dx.description, '; ' ORDER BY dx.id) FROM diagnosis dx WHERE dx.visit_id = v.id) AS diagnoses,
          (SELECT b.net FROM patient_bill b WHERE b.visit_id = v.id AND b.status = 'FINAL') AS net
   FROM visit v JOIN clinic_department d ON d.code = v.department_code LEFT JOIN insurance_scheme s ON s.id = v.scheme_id
   LEFT JOIN app_user u ON u.id = v.clinician_user_id WHERE v.patient_id = ? ORDER BY v.check_in_at DESC LIMIT 200`, patientId,
);

/** The latest vitals on record — the chart's header strip. */
export const latestVitals = (patientId: number) => one<{
  recorded_at: string; temperature_c: number | null; pulse: number | null; bp_systolic: number | null; bp_diastolic: number | null;
  spo2: number | null; weight_kg: number | null; height_cm: number | null; bmi: number | null;
}>(
  `SELECT t.recorded_at, t.temperature_c::float AS temperature_c, t.pulse, t.bp_systolic, t.bp_diastolic, t.spo2,
          t.weight_kg::float AS weight_kg, t.height_cm::float AS height_cm, t.bmi::float AS bmi
   FROM triage t JOIN visit v ON v.id = t.visit_id WHERE v.patient_id = ? ORDER BY t.recorded_at DESC LIMIT 1`, patientId,
);

/** Vital-sign history for the chart's trend lines (oldest first). */
export const vitalsHistory = (patientId: number, limit = 12) => all<{ recorded_at: string; bp_systolic: number | null; bp_diastolic: number | null; weight_kg: number | null; pulse: number | null; temperature_c: number | null }>(
  `SELECT * FROM (SELECT t.recorded_at, t.bp_systolic, t.bp_diastolic, t.weight_kg::float AS weight_kg, t.pulse, t.temperature_c::float AS temperature_c
     FROM triage t JOIN visit v ON v.id = t.visit_id WHERE v.patient_id = ? ORDER BY t.recorded_at DESC LIMIT ${Math.min(limit, 50)}) x ORDER BY recorded_at`,
  patientId,
);

/** What the patient owes across visits (finalised bills' patient share less receipts) and what is on deposit. */
export async function patientAccount(patientId: number): Promise<{ billed: number; paid: number; balance: number }> {
  const r = await one<{ billed: number; paid: number }>(
    `SELECT COALESCE((SELECT SUM(patient_share) FROM patient_bill WHERE patient_id = @id AND status = 'FINAL'), 0) AS billed,
            COALESCE((SELECT SUM(amount) FROM patient_payment WHERE patient_id = @id AND status = 'POSTED'), 0) AS paid`, { id: patientId },
  );
  const billed = Number(r?.billed ?? 0);
  const paid = Number(r?.paid ?? 0);
  return { billed, paid, balance: billed - paid };
}
