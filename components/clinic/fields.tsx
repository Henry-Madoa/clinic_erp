import { Field } from '@/components/ui/field';
import { all } from '@/lib/db';
import { listDepartments, listSchemes, listClinicians } from '@/lib/clinic/setup';
import { listCovers, SEXES, ID_TYPES, BLOOD_GROUPS, RELATIONSHIPS } from '@/lib/clinic/patients';
import { APPOINTMENT_TYPES, APPOINTMENT_SOURCES } from '@/lib/clinic/appointments';
import { humanise, today } from '@/lib/format';
import { PatientPicker } from './pickers';
import type { Patient } from '@/lib/types';

const opt = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: humanise(x) }));

/** Registration and demographics — the same fields create and edit a patient. */
export async function PatientFields({ p, withCover = false }: { p?: Patient; withCover?: boolean }) {
  const [counties, schemes] = await Promise.all([
    all<{ code: string; name: string }>("SELECT code, name FROM county WHERE status = 'ACTIVE' ORDER BY name"),
    withCover ? listSchemes(true) : Promise.resolve([]),
  ]);
  return (
    <>
      <div className="section-title">Identity</div>
      <div className="grid g4">
        <Field name="title" label="Title" type="select" defaultValue={p?.title ?? ''} options={['', 'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Master', 'Baby'].map((t) => ({ value: t, label: t || '—' }))} />
        <Field name="first_name" label="First name" required maxLength={60} defaultValue={p?.first_name} />
        <Field name="middle_name" label="Middle name" maxLength={60} defaultValue={p?.middle_name ?? ''} />
        <Field name="last_name" label="Surname" required maxLength={60} defaultValue={p?.last_name} />
      </div>
      <div className="grid g4">
        <Field name="sex" label="Sex" type="select" required defaultValue={p?.sex ?? ''} options={[{ value: '', label: '…' }, ...opt(SEXES)]} />
        <Field name="date_of_birth" label="Date of birth" type="date" max={today()} defaultValue={p?.date_of_birth ?? ''} />
        {p ? <Field name="dob_estimated" label="Date of birth is estimated" type="checkbox" defaultValue={p.dob_estimated} />
          : <Field name="age_years" label="…or age in years (estimated DOB)" type="number" min={0} max={120} />}
        <Field name="marital_status" label="Marital status" type="select" defaultValue={p?.marital_status ?? ''} options={['', 'SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'CHILD'].map((m) => ({ value: m, label: m ? humanise(m) : '—' }))} />
      </div>
      <div className="grid g4">
        <Field name="id_type" label="ID type" type="select" defaultValue={p?.id_type ?? 'NATIONAL_ID'} options={opt(ID_TYPES)} />
        <Field name="id_number" label={p ? 'ID number (leave blank to keep)' : 'ID number'} maxLength={30} placeholder={p?.id_number_last4 ? `•••• ${p.id_number_last4}` : ''} />
        <Field name="blood_group" label="Blood group" type="select" defaultValue={p?.blood_group ?? ''} options={[{ value: '', label: 'Unknown' }, ...BLOOD_GROUPS.map((b) => ({ value: b, label: b }))]} />
        <Field name="occupation" label="Occupation" maxLength={60} defaultValue={p?.occupation ?? ''} />
      </div>
      <div className="section-title">Contact</div>
      <div className="grid g4">
        <Field name="phone" label="Phone" type="phone" maxLength={30} defaultValue={p?.phone ?? ''} />
        <Field name="alt_phone" label="Alternative phone" type="phone" maxLength={30} defaultValue={p?.alt_phone ?? ''} />
        <Field name="email" label="E-mail" type="email" maxLength={120} defaultValue={p?.email ?? ''} />
        <Field name="county_code" label="County" type="select" defaultValue={p?.county_code ?? ''} options={[{ value: '', label: '—' }, ...counties.map((c) => ({ value: c.code, label: c.name }))]} />
      </div>
      <div className="grid g2">
        <Field name="address" label="Residence / address" maxLength={200} defaultValue={p?.address ?? ''} />
        <Field name="sms_consent" label="Consents to SMS reminders" type="checkbox" defaultValue={p ? p.sms_consent : 1} />
      </div>
      <div className="grid g3">
        <Field name="next_of_kin_name" label="Next of kin" maxLength={100} defaultValue={p?.next_of_kin_name ?? ''} />
        <Field name="next_of_kin_relation" label="Relationship" maxLength={30} defaultValue={p?.next_of_kin_relation ?? ''} />
        <Field name="next_of_kin_phone" label="Next of kin phone" type="phone" maxLength={30} defaultValue={p?.next_of_kin_phone ?? ''} />
      </div>
      <div className="section-title">Clinical alerts</div>
      <div className="grid g3">
        <Field name="allergies" label="Allergies (NKDA if none)" maxLength={500} defaultValue={p?.allergies ?? ''} placeholder="e.g. Penicillin, sulfa" />
        <Field name="chronic_conditions" label="Chronic conditions" maxLength={500} defaultValue={p?.chronic_conditions ?? ''} placeholder="e.g. Hypertension, T2DM" />
        <Field name="alerts" label="Other alerts" maxLength={300} defaultValue={p?.alerts ?? ''} placeholder="e.g. Pregnant, on anticoagulants" />
      </div>
      {p ? <Field name="status" label="Status" type="select" defaultValue={p.status} options={opt(['ACTIVE', 'INACTIVE', 'DECEASED'])} /> : null}
      {withCover ? (
        <>
          <div className="section-title">Medical cover (optional)</div>
          <div className="grid g4">
            <Field name="scheme_id" label="Scheme / insurer" type="select" options={[{ value: '', label: '— cash patient —' }, ...schemes.map((s) => ({ value: s.id, label: s.name }))]} />
            <Field name="member_no" label="Member no." maxLength={40} />
            <Field name="relationship" label="Relationship to principal" type="select" defaultValue="SELF" options={opt(RELATIONSHIPS)} />
            <Field name="valid_to" label="Cover valid to" type="date" />
          </div>
          <Field name="confirm_not_duplicate" label="I have checked — this is not a patient already on the register" type="checkbox" defaultValue={0} />
        </>
      ) : null}
    </>
  );
}

export async function CoverFields() {
  const schemes = await listSchemes(true);
  return (
    <>
      <div className="grid g2">
        <Field name="scheme_id" label="Scheme / insurer" type="select" required options={[{ value: '', label: '…' }, ...schemes.map((s) => ({ value: s.id, label: `${s.name} (${humanise(s.payer_type)})` }))]} />
        <Field name="member_no" label="Member / card no." required maxLength={40} />
      </div>
      <div className="grid g4">
        <Field name="principal_name" label="Principal member" maxLength={100} />
        <Field name="relationship" label="Relationship" type="select" defaultValue="SELF" options={opt(RELATIONSHIPS)} />
        <Field name="valid_from" label="Valid from" type="date" />
        <Field name="valid_to" label="Valid to" type="date" />
      </div>
      <Field name="is_default" label="Use this cover by default at check-in" type="checkbox" defaultValue={1} />
    </>
  );
}

/** Check-in for a known patient (from the chart). */
export async function CheckInFields({ patientId, appointmentNo, departmentCode }: { patientId: number; appointmentNo?: string | null; departmentCode?: string | null }) {
  const [depts, covers, clinicians] = await Promise.all([listDepartments(true), listCovers(patientId), listClinicians()]);
  const active = covers.filter((c) => c.status === 'ACTIVE');
  const def = active.find((c) => c.is_default) ?? null;
  return (
    <>
      <input type="hidden" name="patient_id" value={patientId} />
      {appointmentNo ? <input type="hidden" name="appointment_no" value={appointmentNo} /> : null}
      <div className="grid g3">
        <Field name="department_code" label="Clinic / service point" type="select" required defaultValue={departmentCode ?? 'OPD'}
          options={depts.filter((d) => !['TRIAGE', 'CASH'].includes(d.code)).map((d) => ({ value: d.code, label: d.name, group: d.kind === 'CLINIC' ? 'Clinics' : 'Direct to a service point' }))} />
        <Field name="send_to" label="Send to" type="select" defaultValue="TRIAGE" options={[{ value: 'TRIAGE', label: 'Triage first' }, { value: 'DEPARTMENT', label: 'Straight to the clinic / service point' }]} />
        <Field name="priority" label="Priority" type="select" defaultValue="ROUTINE" options={opt(['ROUTINE', 'URGENT', 'EMERGENCY'])} />
      </div>
      <div className="grid g3">
        <Field name="payment_mode" label="Payment" type="select" defaultValue={def ? 'INSURANCE' : 'CASH'} options={[{ value: 'CASH', label: 'Cash' }, { value: 'INSURANCE', label: 'Insurance / SHA' }, { value: 'CORPORATE', label: 'Corporate' }]} />
        <Field name="cover_id" label="Cover (insurance / corporate)" type="select" defaultValue={def?.id ?? ''}
          options={[{ value: '', label: active.length ? '—' : 'No cover on file' }, ...active.map((c) => ({ value: c.id, label: `${c.scheme_name} · ${c.member_no}${c.valid_to ? ` (to ${c.valid_to})` : ''}` }))]} />
        <Field name="clinician_user_id" label="Clinician (optional)" type="select" options={[{ value: '', label: '— next available —' }, ...clinicians.map((c) => ({ value: c.id, label: `${c.full_name} · ${c.role_name}` }))]} />
      </div>
      <div className="grid g2">
        <Field name="chief_complaint" label="Reason for visit" maxLength={300} placeholder="e.g. fever for 3 days, toothache" />
        <Field name="referral_source" label="Referred by (optional)" maxLength={100} />
      </div>
    </>
  );
}

/** Booking; `patientId` given → the patient is fixed, else search for one. */
export async function BookingFields({ patientId, patientLabel, date }: { patientId?: number; patientLabel?: string; date?: string }) {
  const [depts, clinicians] = await Promise.all([listDepartments(true, 'CLINIC'), listClinicians()]);
  return (
    <>
      {patientId ? <PatientPicker initial={{ id: patientId, label: patientLabel ?? '' }} /> : <PatientPicker />}
      <div className="grid g3">
        <Field name="department_code" label="Clinic" type="select" required options={depts.map((d) => ({ value: d.code, label: d.name }))} />
        <Field name="clinician_user_id" label="Clinician" type="select" options={[{ value: '', label: '— any —' }, ...clinicians.map((c) => ({ value: c.id, label: c.full_name }))]} />
        <Field name="appointment_type" label="Type" type="select" defaultValue="NEW" options={opt(APPOINTMENT_TYPES)} />
      </div>
      <div className="grid g4">
        <Field name="appointment_date" label="Date" type="date" required min={today()} defaultValue={date ?? today()} />
        <Field name="start_time" label="Time" type="time" required defaultValue="09:00" />
        <Field name="duration_mins" label="Minutes" type="number" min={5} max={480} defaultValue={20} />
        <Field name="source" label="Booked via" type="select" defaultValue="PHONE" options={opt(APPOINTMENT_SOURCES)} />
      </div>
      <Field name="reason" label="Reason" maxLength={300} />
    </>
  );
}
