import Link from 'next/link';
import type { ReactNode } from 'react';
import { initials, humanise } from '@/lib/format';
import type { Acuity as AcuityCode, Sex } from '@/lib/types';

/** Kenya triage acuity as a coloured chip. */
export function Acuity({ value }: { value: AcuityCode | null | undefined }) {
  return <span className={`acuity ${value ?? 'NONE'}`}>{value ? humanise(value) : 'Not triaged'}</span>;
}

export const ageSex = (age: number | null | undefined, sex: Sex | string): string =>
  `${age == null ? '?' : age}y ${sex === 'FEMALE' ? 'F' : sex === 'MALE' ? 'M' : 'I'}`;

/**
 * The patient identity strip — name, MRN, age/sex, payer — with allergies and clinical alerts
 * always in view, so nobody prescribes or treats without seeing them.
 */
export function PatientBanner({ p, right, link = true }: {
  p: {
    mrn: string; full_name?: string; patient_name?: string; sex: Sex; age: number | null; phone?: string | null; photo_url?: string | null;
    allergies?: string | null; alerts?: string | null; chronic_conditions?: string | null; blood_group?: string | null; payer?: string | null;
  };
  right?: ReactNode;
  link?: boolean;
}) {
  const name = p.full_name ?? p.patient_name ?? '';
  const allergies = String(p.allergies ?? '').trim();
  const noAllergy = !allergies || /^(none|nkda|nil|no known)/i.test(allergies);
  return (
    <div className="patient-banner">
      {p.photo_url
        // eslint-disable-next-line @next/next/no-img-element -- a Cloudinary delivery URL, already sized
        ? <img className="pb-photo" src={p.photo_url} alt="" />
        : <div className="pb-photo">{initials(name)}</div>}
      <div>
        <div className="pb-name">{link ? <Link href={`/patients/${p.mrn}`}>{name}</Link> : name}</div>
        <div className="pb-meta">
          <span className="mono">{p.mrn}</span>
          <span>{ageSex(p.age, p.sex)}</span>
          {p.phone ? <span>📞 {p.phone}</span> : null}
          {p.blood_group ? <span>🩸 {p.blood_group}</span> : null}
          <span>{p.payer ?? 'Cash'}</span>
        </div>
        <div className="pb-chips">
          <span className={noAllergy ? 'info-chip' : 'alert-chip'}>{noAllergy ? 'No known allergies' : `⚠ Allergies: ${allergies}`}</span>
          {p.alerts ? <span className="alert-chip">🚩 {p.alerts}</span> : null}
          {p.chronic_conditions ? <span className="info-chip">{p.chronic_conditions}</span> : null}
        </div>
      </div>
      {right ? <div className="pb-right">{right}</div> : null}
    </div>
  );
}

/** Vital signs as tiles, abnormal values in red. */
export function VitalsStrip({ t }: {
  t: {
    temperature_c: number | null; pulse: number | null; resp_rate?: number | null; bp_systolic: number | null; bp_diastolic: number | null;
    spo2: number | null; weight_kg: number | null; height_cm: number | null; bmi: number | null; pain_score?: number | null; blood_sugar?: number | null;
  };
}) {
  const tiles: [string, ReactNode, string, boolean][] = [
    ['BP', t.bp_systolic != null ? `${t.bp_systolic}/${t.bp_diastolic ?? '—'}` : '—', 'mmHg', (t.bp_systolic ?? 0) >= 140 || (t.bp_systolic ?? 120) < 90],
    ['Pulse', t.pulse ?? '—', 'bpm', t.pulse != null && (t.pulse > 100 || t.pulse < 50)],
    ['Temp', t.temperature_c ?? '—', '°C', t.temperature_c != null && (t.temperature_c >= 37.5 || t.temperature_c < 35.5)],
    ['SpO₂', t.spo2 ?? '—', '%', t.spo2 != null && t.spo2 < 95],
    ['Resp', t.resp_rate ?? '—', '/min', t.resp_rate != null && (t.resp_rate > 22 || t.resp_rate < 10)],
    ['Weight', t.weight_kg ?? '—', 'kg', false],
    ['Height', t.height_cm ?? '—', 'cm', false],
    ['BMI', t.bmi ?? '—', '', t.bmi != null && (t.bmi >= 30 || t.bmi < 18.5)],
  ];
  if (t.pain_score != null) tiles.push(['Pain', t.pain_score, '/10', t.pain_score >= 7]);
  if (t.blood_sugar != null) tiles.push(['RBS', t.blood_sugar, 'mmol/L', t.blood_sugar > 11 || t.blood_sugar < 4]);
  return (
    <div className="vitals-strip">
      {tiles.map(([label, value, unit, abn]) => (
        <div key={label} className={`vital${abn ? ' abn' : ''}`}>
          <div className="v-label">{label}</div>
          <div className="v-value">{value}{value !== '—' && unit ? <span className="v-unit">{unit}</span> : null}</div>
        </div>
      ))}
    </div>
  );
}

const STAGES = ['TRIAGE', 'CONSULTATION', 'INVESTIGATION', 'PHARMACY', 'CASHIER', 'COMPLETED'];

/** Where the visit is in the patient journey. */
export function StageTrack({ stage }: { stage: string }) {
  const at = STAGES.indexOf(stage);
  return (
    <div className="visit-stages">
      {STAGES.map((s, i) => (
        <div key={s} className={`visit-stage${stage === 'CANCELLED' ? '' : i < at ? ' done' : i === at ? ' now' : ''}`}>{humanise(s)}</div>
      ))}
    </div>
  );
}
