import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireAction } from '@/lib/session';
import { one } from '@/lib/db';
import { getOrg } from '@/lib/org';
import { getVisit, listTriage } from '@/lib/clinic/visits';
import { listCharges, visitAccount, listVisitPayments } from '@/lib/clinic/billing';
import { labReport } from '@/lib/clinic/lab';
import { getPrescription, prescriptionLines } from '@/lib/clinic/pharmacy';
import { getDocument, listConsultations, listDiagnoses, listVisitPrescriptions } from '@/lib/clinic/consultation';
import { getPlan, listPlanItems } from '@/lib/clinic/dental';
import { getClaim, claimCharges } from '@/lib/clinic/claims';
import { getPatientById } from '@/lib/clinic/patients';
import { amountInWords } from '@/lib/numberToWords';
import { formatDate, formatDateTime, formatMoney, humanise } from '@/lib/format';
import { PrintButton } from './print-button';
import type { ActionKey } from '@/lib/permissions';

const ACTION: Record<string, ActionKey> = {
  bill: 'CASHIER_READ', receipt: 'CASHIER_READ', lab: 'LAB_READ', rx: 'PHARMACY_READ', document: 'VISITS_READ',
  visit: 'VISITS_READ', 'dental-plan': 'DENTAL_READ', claim: 'CLAIMS_READ',
};

export default async function ClinicPrint({ params }: { params: Promise<{ kind: string; no: string }> }) {
  const { kind, no: raw } = await params;
  const no = decodeURIComponent(raw);
  if (!ACTION[kind]) notFound();
  const user = await requireAction(ACTION[kind]);
  const org = await getOrg();
  const body = await build(kind, no);
  if (!body) notFound();
  return (
    <>
      <div className="print-bar"><PrintButton /><span className="tiny muted-cell">Printed by {user.full_name} · {formatDateTime(new Date().toISOString())}</span></div>
      <div className="clin-doc">
        <div className="cd-head">
          <div>
            <div className="cd-org">{org?.name}</div>
            <div>{[org?.physical_address, org?.postal_address, org?.city].filter(Boolean).join(' · ')}</div>
            <div>{[org?.phone_primary, org?.email].filter(Boolean).join(' · ')}</div>
            {org?.kra_pin ? <div>PIN {org.kra_pin}</div> : null}
          </div>
          <div className="cd-title">{body.title}<div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0 }}>{body.ref}</div></div>
        </div>
        {body.content}
      </div>
    </>
  );
}

async function patientGrid(patientId: number, extra: [string, ReactNode][] = []) {
  const p = await getPatientById(patientId);
  if (!p) return null;
  const rows: [string, ReactNode][] = [['Patient', <b key="n">{p.full_name}</b>], ['MRN', p.mrn], ['Age / sex', `${p.age ?? '?'} y · ${humanise(p.sex)}`], ['Phone', p.phone ?? '—'], ...extra];
  return <div className="cd-grid">{rows.map(([k, v]) => <div key={k}><span style={{ color: '#666' }}>{k}: </span>{v}</div>)}</div>;
}

async function build(kind: string, no: string): Promise<{ title: string; ref: string; content: ReactNode } | null> {
  if (kind === 'bill') {
    const b = await one<{ id: number; visit_id: number; patient_id: number; bill_date: string; no: string }>('SELECT id, visit_id, patient_id, bill_date, no FROM patient_bill WHERE no = ?', no);
    if (!b) return null;
    const v = (await getVisit((await one<{ no: string }>('SELECT no FROM visit WHERE id = ?', b.visit_id))!.no))!;
    const [charges, acc, pays] = await Promise.all([listCharges(v.id, false), visitAccount(v.id), listVisitPayments(v.id)]);
    return {
      title: 'Invoice', ref: `${b.no} · ${formatDate(b.bill_date)}`,
      content: (
        <>
          {await patientGrid(b.patient_id, [['Visit', `${v.no} · ${formatDate(v.visit_date)}`], ['Payer', v.scheme_name ? `${v.scheme_name} · ${v.member_no ?? ''}` : 'Cash']])}
          <table><thead><tr><th>Service</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Amount</th></tr></thead>
            <tbody>{charges.map((c) => <tr key={c.id}><td>{c.description}</td><td className="num">{c.quantity}</td><td className="num">{formatMoney(c.unit_price)}</td><td className="num">{formatMoney(c.amount)}</td></tr>)}</tbody></table>
          <table style={{ width: 320, marginLeft: 'auto' }}><tbody>
            <tr><td>Total</td><td className="num">{formatMoney(acc.gross)}</td></tr>
            {acc.discount ? <tr><td>Discount</td><td className="num">−{formatMoney(acc.discount)}</td></tr> : null}
            {acc.schemeShare ? <tr><td>Payable by {v.scheme_name}</td><td className="num">{formatMoney(acc.schemeShare)}</td></tr> : null}
            <tr><td><b>Payable by patient</b></td><td className="num"><b>{formatMoney(acc.patientShare)}</b></td></tr>
            <tr><td>Paid</td><td className="num">{formatMoney(acc.paid)}</td></tr>
            <tr><td><b>Balance</b></td><td className="num"><b>{formatMoney(acc.balance)}</b></td></tr>
          </tbody></table>
          {pays.length ? <p style={{ fontSize: 11 }}>Receipts: {pays.filter((p) => p.status === 'POSTED').map((p) => `${p.no} (${p.method} ${formatMoney(p.amount)})`).join(', ')}</p> : null}
          <div className="cd-foot"><div>Medical services are exempt from VAT.</div><div className="cd-sign">Cashier</div></div>
        </>
      ),
    };
  }
  if (kind === 'receipt') {
    const r = await one<{ no: string; patient_id: number; visit_id: number | null; payment_date: string; method: string; reference: string | null; amount: number; received_by: string; status: string }>(
      'SELECT no, patient_id, visit_id, payment_date, method, reference, amount, received_by, status FROM patient_payment WHERE no = ?', no);
    if (!r) return null;
    const v = r.visit_id ? await one<{ no: string }>('SELECT no FROM visit WHERE id = ?', r.visit_id) : undefined;
    const acc = r.visit_id ? await visitAccount(r.visit_id) : null;
    return {
      title: r.status === 'VOIDED' ? 'Receipt — VOID' : 'Official Receipt', ref: `${r.no} · ${formatDate(r.payment_date)}`,
      content: (
        <>
          {await patientGrid(r.patient_id, [['Visit', v?.no ?? '—'], ['Method', `${r.method === 'MPESA' ? 'M-Pesa' : humanise(r.method)}${r.reference ? ` · ${r.reference}` : ''}`]])}
          <table><tbody><tr><td style={{ fontSize: 18 }}>Amount received</td><td className="num" style={{ fontSize: 22 }}><b>{formatMoney(r.amount)}</b></td></tr>
            <tr><td colSpan={2} style={{ fontStyle: 'italic' }}>{amountInWords(Number(r.amount))}</td></tr>
            {acc ? <tr><td>Balance on the visit</td><td className="num">{formatMoney(acc.balance)}</td></tr> : null}</tbody></table>
          <div className="cd-foot"><div>Thank you. Keep this receipt.</div><div className="cd-sign">Received by {r.received_by}</div></div>
        </>
      ),
    };
  }
  if (kind === 'lab') {
    const rep = await labReport(no);
    if (!rep) return null;
    const first = rep[0].test;
    const pid = (await one<{ patient_id: number }>('SELECT patient_id FROM lab_order WHERE no = ?', no))!.patient_id;
    return {
      title: 'Laboratory Report', ref: `${no} · ${formatDateTime(first.ordered_at)}`,
      content: (
        <>
          {await patientGrid(pid, [['Requested by', first.ordered_by], ['Visit', first.visit_no]])}
          {rep.map(({ test, rows }) => (
            <div key={test.id}>
              <h4 style={{ margin: '14px 0 4px' }}>{test.test_name} <span style={{ fontWeight: 400, fontSize: 11 }}>· specimen {test.specimen_no ?? '—'} · {test.status === 'VERIFIED' ? `verified by ${test.verified_by ?? 'lab'} ${formatDateTime(test.verified_at)}` : 'PRELIMINARY — not verified'}</span></h4>
              <table><thead><tr><th>Parameter</th><th className="num">Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
                <tbody>{rows.map(({ p, r, range }) => (r ? <tr key={p.id}><td>{p.name}</td><td className="num"><b>{r.value_num ?? r.value_text}</b></td><td>{p.unit ?? ''}</td><td>{range}</td><td><b>{r.flag === 'N' ? '' : r.flag}</b></td></tr> : null))}</tbody></table>
              {test.comment ? <p style={{ fontSize: 12 }}>Comment: {test.comment}</p> : null}
            </div>
          ))}
          <div className="cd-foot"><div>H/L = outside reference range · HH/LL = critical</div><div className="cd-sign">Laboratory</div></div>
        </>
      ),
    };
  }
  if (kind === 'rx') {
    const rx = await getPrescription(no);
    if (!rx) return null;
    const lines = await prescriptionLines(rx.id);
    return {
      title: 'Prescription', ref: `${rx.no} · ${formatDate(rx.prescribed_at)}`,
      content: (
        <>
          {await patientGrid(rx.patient_id, [['Allergies', rx.allergies ?? 'None recorded'], ['Prescriber', rx.prescribed_by]])}
          <table><thead><tr><th>Drug</th><th>Dose / route</th><th>Frequency</th><th className="num">Days</th><th className="num">Qty</th><th>Instructions</th></tr></thead>
            <tbody>{lines.filter((l) => l.status !== 'CANCELLED').map((l) => <tr key={l.id}><td><b>{l.generic_name}</b> {l.strength ?? ''}</td><td>{l.dose} {l.route}</td><td>{l.frequency}</td><td className="num">{l.duration_days}</td><td className="num">{l.dispensed_qty || l.quantity}</td><td>{l.instructions ?? ''}</td></tr>)}</tbody></table>
          <div className="cd-foot"><div /><div className="cd-sign">Prescriber</div></div>
        </>
      ),
    };
  }
  if (kind === 'document') {
    const d = await getDocument(no);
    if (!d) return null;
    const title = d.doc_type === 'REFERRAL' ? 'Referral Letter' : d.doc_type === 'SICK_NOTE' ? 'Sick-off Note' : 'Medical Report';
    return {
      title, ref: `${d.no} · ${formatDate(d.issued_at)}`,
      content: (
        <>
          {await patientGrid(d.patient_id)}
          {d.doc_type === 'REFERRAL' ? <p><b>To:</b> {d.referred_to}{d.specialty ? ` — ${d.specialty}` : ''} · <b>Urgency:</b> {humanise(d.urgency)}</p> : null}
          {d.doc_type === 'SICK_NOTE' ? <p><b>Off duty from</b> {formatDate(d.from_date)} <b>to</b> {formatDate(d.to_date)} (inclusive).</p> : null}
          <div style={{ whiteSpace: 'pre-wrap', minHeight: 160, lineHeight: 1.6 }}>{d.body}</div>
          <div className="cd-foot"><div>Issued {formatDateTime(d.issued_at)}</div><div className="cd-sign">{d.issued_by} — signature &amp; stamp</div></div>
        </>
      ),
    };
  }
  if (kind === 'visit') {
    const v = await getVisit(no);
    if (!v) return null;
    const [tri, notes, dx, rx] = await Promise.all([listTriage(v.id), listConsultations(v.id), listDiagnoses(v.id), listVisitPrescriptions(v.id)]);
    const t = tri[0];
    return {
      title: 'Visit Summary', ref: `${v.no} · ${formatDate(v.visit_date)}`,
      content: (
        <>
          {await patientGrid(v.patient_id, [['Clinic', v.department_name], ['Clinician', v.clinician_name ?? '—']])}
          {t ? <p><b>Vitals:</b> BP {t.bp_systolic ?? '—'}/{t.bp_diastolic ?? '—'} · pulse {t.pulse ?? '—'} · temp {t.temperature_c ?? '—'}°C · SpO₂ {t.spo2 ?? '—'}% · weight {t.weight_kg ?? '—'} kg · triage {humanise(t.acuity)}</p> : null}
          {notes.map((n) => (
            <div key={n.id}>{[['Complaint', n.chief_complaint], ['History', n.history], ['Examination', n.examination], ['Assessment', n.assessment], ['Plan', n.plan]].filter(([, x]) => x).map(([k, x]) => <p key={k}><b>{k}:</b> {x}</p>)}</div>
          ))}
          <p><b>Diagnosis:</b> {dx.map((d) => `${d.icd_code ? `${d.icd_code} ` : ''}${d.description}`).join('; ') || '—'}</p>
          {rx.length ? <p><b>Treatment:</b> {rx.filter((l) => l.status !== 'CANCELLED').map((l) => `${l.generic_name} ${l.strength ?? ''} ${l.dose} ${l.frequency} × ${l.duration_days}d`).join('; ')}</p> : null}
          <p><b>Outcome:</b> {humanise(v.outcome) || '—'}{v.follow_up_date ? ` · follow-up ${formatDate(v.follow_up_date)}` : ''}</p>
          <div className="cd-foot"><div /><div className="cd-sign">Clinician</div></div>
        </>
      ),
    };
  }
  if (kind === 'dental-plan') {
    const plan = await getPlan(no);
    if (!plan) return null;
    const items = (await listPlanItems(plan.id)).filter((i) => i.status !== 'CANCELLED');
    return {
      title: 'Dental Treatment Quotation', ref: `${plan.no} · ${formatDate(plan.created_at)}`,
      content: (
        <>
          {await patientGrid(plan.patient_id, [['Plan', plan.title]])}
          <table><thead><tr><th>Phase</th><th>Tooth</th><th>Procedure</th><th>Status</th><th className="num">Fee</th></tr></thead>
            <tbody>{items.map((i) => <tr key={i.id}><td>{i.phase}</td><td>{i.tooth ?? '—'}{i.surfaces ? ` ${i.surfaces}` : ''}</td><td>{i.description}</td><td>{humanise(i.status)}</td><td className="num">{formatMoney(i.fee)}</td></tr>)}
              <tr><td colSpan={4}><b>Total</b></td><td className="num"><b>{formatMoney(items.reduce((a, i) => a + Number(i.fee), 0))}</b></td></tr></tbody></table>
          <p style={{ fontSize: 11 }}>Fees are estimates valid for 30 days; the final bill reflects the treatment actually done.</p>
          <div className="cd-foot"><div className="cd-sign">Patient acceptance</div><div className="cd-sign">Dentist</div></div>
        </>
      ),
    };
  }
  if (kind === 'claim') {
    const c = await getClaim(no);
    if (!c) return null;
    const lines = await claimCharges(c.id);
    const v = await getVisit(c.visit_no!);
    const dx = v ? await listDiagnoses(v.id) : [];
    return {
      title: 'Insurance Claim', ref: `${c.no} · ${formatDate(c.claim_date)}`,
      content: (
        <>
          {await patientGrid(c.patient_id, [['Payer', c.scheme_name], ['Member no.', c.member_no ?? '—'], ['Visit', `${c.visit_no} · ${formatDate(c.visit_date)}`], ['Pre-auth', c.preauth_no ?? '—']])}
          <p><b>Diagnosis:</b> {dx.map((d) => `${d.icd_code ?? ''} ${d.description}`.trim()).join('; ') || '—'}</p>
          <table><thead><tr><th>Date</th><th>Code</th><th>Service</th><th className="num">Qty</th><th className="num">Claimed</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i}><td>{formatDate(l.charged_at)}</td><td>{l.service_code ?? ''}</td><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{formatMoney(l.scheme_amount)}</td></tr>)}
              <tr><td colSpan={4}><b>Total claimed</b></td><td className="num"><b>{formatMoney(c.amount)}</b></td></tr></tbody></table>
          <div className="cd-foot"><div className="cd-sign">Member signature</div><div className="cd-sign">For the facility</div></div>
        </>
      ),
    };
  }
  return null;
}
