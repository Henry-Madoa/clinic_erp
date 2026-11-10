import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { getVisit, listTriage, suggestedAcuity, OUTCOMES } from '@/lib/clinic/visits';
import { listConsultations, listDiagnoses, listVisitImaging, listVisitPrescriptions, listVisitProcedures, listVisitDocuments, MODALITIES } from '@/lib/clinic/consultation';
import { listCharges, visitAccount, listVisitPayments, getBillByVisit, PAYMENT_METHODS } from '@/lib/clinic/billing';
import { listVisitLabTests, listResults, rangeText } from '@/lib/clinic/lab';
import { listLabTests, listLabParameters, listServiceItems, listDrugs } from '@/lib/clinic/setup';
import { currentChart, listPlans, listPlanItems, DENTAL_CONDITIONS, ADULT_TEETH, PRIMARY_TEETH } from '@/lib/clinic/dental';
import { listVisitPreauths } from '@/lib/clinic/claims';
import { getPatientById } from '@/lib/clinic/patients';
import { formatDate, formatDateTime, formatMoney, humanise, today } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, DefinitionList, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { EditableCard } from '@/components/ui/editable-card';
import { InlineEditForm } from '@/components/ui/inline-edit-form';
import { ModalFormButton, RunButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { PatientBanner, VitalsStrip, StageTrack, Acuity } from '@/components/clinic/patient-banner';
import { Odontogram } from '@/components/clinic/odontogram';
import { IcdPicker, MultiPick, PrescriptionBuilder } from '@/components/clinic/pickers';
import {
  recordTriageRequest, saveConsultationRequest, addDiagnosisRequest, removeDiagnosisRequest, orderLabRequest, orderImagingRequest,
  orderProcedureRequest, issueDocumentRequest, completeVisitRequest, routeVisitRequest, cancelVisitRequest, addChargeRequest,
  cancelChargeRequest, discountChargeRequest, finaliseBillRequest, receivePaymentRequest, voidPaymentRequest, recordFindingRequest,
  createPlanRequest, addPlanItemRequest, completePlanItemRequest, planStatusRequest, requestPreauthRequest, bookFollowUpRequest,
} from '@/app/actions/clinic';
import type { SessionUser, VisitView } from '@/lib/types';

const TABS = [
  { key: 'summary', label: 'Summary' }, { key: 'triage', label: 'Triage' }, { key: 'notes', label: 'Clinical notes' },
  { key: 'orders', label: 'Orders & prescriptions' }, { key: 'results', label: 'Results' }, { key: 'dental', label: 'Dental' },
  { key: 'billing', label: 'Billing' }, { key: 'documents', label: 'Documents' },
];

export default async function VisitWorkspace({ params }: { params: Promise<{ no: string; tab?: string[] }> }) {
  const user = await requireAction('VISITS_READ');
  const { no: raw, tab: seg } = await params;
  const no = decodeURIComponent(raw);
  const tab = seg?.[0] ?? 'summary';
  const v = await getVisit(no);
  if (!v || !TABS.some((t) => t.key === tab)) notFound();
  const patient = (await getPatientById(v.patient_id))!;
  const open = v.status === 'OPEN';
  const base = `/visits/${v.no}`;
  const tabs = v.department_code === 'DENTAL' || tab === 'dental' ? TABS : TABS.filter((t) => t.key !== 'dental');

  return (
    <Page title={`${v.patient_name} — ${v.no}`} crumb={`${v.department_name} · ${humanise(v.visit_type)} visit · checked in ${formatDateTime(v.check_in_at)}${v.queue_no ? ` · ${v.queue_no}` : ''}`} user={user}>
      <PatientBanner p={{ ...patient, payer: v.scheme_name ? `${v.scheme_name} · ${v.member_no ?? ''}` : 'Cash' }} right={(
        <>
          <Acuity value={v.acuity} />
          <Pill status={v.status === 'OPEN' ? v.stage : v.status}>{humanise(v.status === 'OPEN' ? v.stage : v.status)}</Pill>
          <span className="tiny muted-cell">{v.priority !== 'ROUTINE' ? `${humanise(v.priority)} · ` : ''}{v.clinician_name ?? 'no clinician yet'}</span>
        </>
      )} />
      {v.status !== 'CANCELLED' ? <StageTrack stage={v.stage} /> : null}
      <VisitToolbar v={v} user={user} />
      <Tabs tabs={tabs} active={tab} hrefFor={(k) => (k === 'summary' ? base : `${base}/${k}`)} />
      {tab === 'summary' ? <Summary v={v} /> : null}
      {tab === 'triage' ? <TriageTab v={v} canRecord={open && canAction(user, 'TRIAGE_RECORD')} /> : null}
      {tab === 'notes' ? <NotesTab v={v} user={user} canWork={open && canAction(user, 'CONSULTATION_WORK')} /> : null}
      {tab === 'orders' ? <OrdersTab v={v} allergies={patient.allergies} canWork={open && !v.bill_status && canAction(user, 'CONSULTATION_WORK')} canClaims={canAction(user, 'CLAIMS_MANAGE')} /> : null}
      {tab === 'results' ? <ResultsTab v={v} /> : null}
      {tab === 'dental' ? <DentalTab v={v} canWork={canAction(user, 'DENTAL_WORK')} /> : null}
      {tab === 'billing' ? <BillingTab v={v} user={user} /> : null}
      {tab === 'documents' ? <DocumentsTab v={v} canWork={canAction(user, 'CONSULTATION_WORK')} /> : null}
    </Page>
  );
}

/* ------------------------------------------------------------------ toolbar */

function VisitToolbar({ v, user }: { v: VisitView; user: SessionUser }) {
  const open = v.status === 'OPEN';
  const routeOpts = [
    { value: 'CONSULTATION', label: 'Back to the clinician' }, { value: 'LAB', label: 'Laboratory' }, { value: 'IMAGING', label: 'Imaging' },
    { value: 'PROCEDURE', label: 'Procedure / nursing room' }, { value: 'PHARMACY', label: 'Pharmacy' }, { value: 'CASHIER', label: 'Cashier' },
  ];
  return (
    <Toolbar>
      <Link href="/visits" className="btn ghost sm">← Patient flow</Link>
      <Link href={`/clinic-print/visit/${v.no}`} target="_blank" className="btn ghost sm">Print summary</Link>
      <Spacer />
      {open && canAction(user, 'QUEUES_WORK') ? (
        <ModalFormButton label="Send to…" className="btn ghost" title="Send the patient on" action={routeVisitRequest.bind(null, v.no)} submitLabel="Send" successTitle="Patient sent">
          <Field name="target" label="Send to" type="select" required options={routeOpts} />
          <Field name="from_department" label="Finished at (closes that queue place)" type="select"
            options={[{ value: '', label: '— leave queues as they are —' }, { value: 'TRIAGE', label: 'Triage' }, { value: v.department_code, label: v.department_name }, { value: 'LAB', label: 'Laboratory' }, { value: 'RAD', label: 'Imaging' }, { value: 'PROC', label: 'Procedure room' }]} />
        </ModalFormButton>
      ) : null}
      {open && canAction(user, 'CONSULTATION_WORK') && ['TRIAGE', 'CONSULTATION', 'INVESTIGATION'].includes(v.stage) ? (
        <ModalFormButton label="Complete consultation" title="Complete the consultation" action={completeVisitRequest.bind(null, v.no)} submitLabel="Complete" successTitle="Consultation complete — patient sent on">
          <div className="grid g2">
            <Field name="outcome" label="Outcome" type="select" defaultValue="HOME" options={OUTCOMES.map((o) => ({ value: o, label: humanise(o) }))} />
            <Field name="follow_up_date" label="Follow-up date (optional)" type="date" min={today()} />
          </div>
          <p className="tiny muted-cell">The patient goes to the pharmacy if drugs are waiting, otherwise to the cashier.</p>
        </ModalFormButton>
      ) : null}
      {open && canAction(user, 'APPOINTMENTS_MANAGE') ? (
        <ModalFormButton label="Book follow-up" className="btn ghost" title="Book a follow-up appointment" action={bookFollowUpRequest.bind(null, v.no)} submitLabel="Book" successTitle="Follow-up booked">
          <div className="grid g3">
            <Field name="appointment_date" label="Date" type="date" required min={today()} defaultValue={v.follow_up_date ?? ''} />
            <Field name="start_time" label="Time" type="time" required defaultValue="09:00" />
            <Field name="duration_mins" label="Minutes" type="number" defaultValue={20} />
          </div>
          <Field name="reason" label="Reason" maxLength={300} defaultValue="Review" />
        </ModalFormButton>
      ) : null}
      {open && canAction(user, 'VISITS_CHECK_IN') ? (
        <ModalFormButton label="Cancel visit" className="btn ghost danger" submitClass="btn danger" title={`Cancel ${v.no}`} action={cancelVisitRequest.bind(null, v.no)} submitLabel="Cancel visit" successTitle="Visit cancelled">
          <Field name="reason" label="Reason" required maxLength={300} placeholder="Checked in in error, left before being seen…" />
        </ModalFormButton>
      ) : null}
    </Toolbar>
  );
}

/* ------------------------------------------------------------------ summary */

async function Summary({ v }: { v: VisitView }) {
  const [triage, notes, dx, labs, rx, acc] = await Promise.all([
    listTriage(v.id), listConsultations(v.id), listDiagnoses(v.id), listVisitLabTests(v.id), listVisitPrescriptions(v.id), visitAccount(v.id),
  ]);
  return (
    <>
      <div className="grid g4 stack-2">
        <Stat label="Waiting / in clinic" value={v.status === 'OPEN' ? `${Math.floor(v.waiting_mins / 60)}h ${v.waiting_mins % 60}m` : '—'} foot={v.chief_complaint ?? undefined} small />
        <Stat accent={false} label="Lab tests" value={`${labs.filter((l) => l.status === 'VERIFIED').length} / ${labs.filter((l) => l.status !== 'CANCELLED').length}`} foot="released / ordered" />
        <Stat accent={false} label="Prescribed items" value={rx.filter((r) => r.status !== 'CANCELLED').length} foot={`${rx.filter((r) => r.status === 'DISPENSED').length} dispensed`} />
        <Stat accent={false} label="Patient owes" value={formatMoney(acc.balance)} foot={acc.schemeShare ? `${formatMoney(acc.schemeShare)} to the scheme` : `of ${formatMoney(acc.net)}`} />
      </div>
      <Card>
        <CardHead title="Vitals" sub={triage[0] ? `${formatDateTime(triage[0].recorded_at)} by ${triage[0].recorded_by}` : 'Not triaged yet'} />
        {triage[0] ? <VitalsStrip t={triage[0]} /> : <EmptyState icon="🩺" title="No vitals" />}
      </Card>
      <Card>
        <CardHead title="Diagnoses" />
        {dx.length ? <ul>{dx.map((d) => <li key={d.id}><b>{d.icd_code ?? ''}</b> {d.description} <span className="tiny muted-cell">({humanise(d.diagnosis_type)})</span></li>)}</ul> : <EmptyState icon="🩺" title="No diagnosis yet" />}
      </Card>
      {notes.map((n) => (
        <Card key={n.id}>
          <CardHead title={`${n.clinician_name}`} sub={`${formatDateTime(n.started_at)} · ${humanise(n.status)}`} />
          <SoapRead n={n} />
        </Card>
      ))}
    </>
  );
}

function SoapRead({ n }: { n: Awaited<ReturnType<typeof listConsultations>>[number] }) {
  const rows: [string, string | null][] = [
    ['Chief complaint', n.chief_complaint], ['History of presenting illness', n.history], ['Past medical history', n.past_history],
    ['Family & social', n.family_social_history], ['Review of systems', n.review_of_systems], ['Examination', n.examination],
    ['Assessment', n.assessment], ['Plan', n.plan],
  ];
  return <dl className="soap-read">{rows.filter(([, val]) => val).map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>;
}

/* ------------------------------------------------------------------ triage */

async function TriageTab({ v, canRecord }: { v: VisitView; canRecord: boolean }) {
  const rows = await listTriage(v.id);
  return (
    <>
      {canRecord ? (
        <Card>
          <CardHead title="Record vital signs" sub="The acuity is set at least as high as the vitals call for (Kenya triage)" />
          <InlineTriageForm no={v.no} />
        </Card>
      ) : null}
      <Card>
        <CardHead title="Triage history" />
        {rows.length ? rows.map((t) => (
          <div key={t.id} className="stack-2">
            <div className="inline" style={{ gap: 8, marginBottom: 6 }}><Acuity value={t.acuity} /><span className="tiny muted-cell">{formatDateTime(t.recorded_at)} · {t.recorded_by}</span>
              {t.acuity !== suggestedAcuity(t) ? <span className="tiny">(vitals alone suggest {humanise(suggestedAcuity(t))})</span> : null}</div>
            <VitalsStrip t={t} />
            {t.notes ? <div className="note-box stack-2">{t.notes}</div> : null}
          </div>
        )) : <EmptyState icon="🩺" title="Not triaged" />}
      </Card>
    </>
  );
}

function InlineTriageForm({ no }: { no: string }) {
  return (
    <ModalFormButton label="Enter vitals" title="Triage — vital signs" wide action={recordTriageRequest.bind(null, no)} submitLabel="Save & send to clinician" successTitle="Triage recorded">
      <div className="grid g4">
        <Field name="bp_systolic" label="BP systolic (mmHg)" type="number" min={40} max={300} />
        <Field name="bp_diastolic" label="BP diastolic (mmHg)" type="number" min={20} max={200} />
        <Field name="pulse" label="Pulse (bpm)" type="number" min={20} max={250} />
        <Field name="temperature_c" label="Temperature (°C)" type="number" step="0.1" min={25} max={45} />
      </div>
      <div className="grid g4">
        <Field name="resp_rate" label="Resp. rate (/min)" type="number" min={4} max={80} />
        <Field name="spo2" label="SpO₂ (%)" type="number" min={30} max={100} />
        <Field name="weight_kg" label="Weight (kg)" type="number" step="0.1" />
        <Field name="height_cm" label="Height (cm)" type="number" step="0.1" />
      </div>
      <div className="grid g4">
        <Field name="muac_cm" label="MUAC (cm, children)" type="number" step="0.1" />
        <Field name="blood_sugar" label="RBS (mmol/L)" type="number" step="0.1" />
        <Field name="pain_score" label="Pain (0–10)" type="number" min={0} max={10} />
        <Field name="acuity" label="Acuity" type="select" defaultValue="GREEN" options={['GREEN', 'YELLOW', 'ORANGE', 'RED'].map((a) => ({ value: a, label: humanise(a) }))} />
      </div>
      <Field name="notes" label="Triage notes" type="textarea" rows={2} maxLength={1000} />
    </ModalFormButton>
  );
}

/* ------------------------------------------------------------------ notes & diagnoses */

async function NotesTab({ v, user, canWork }: { v: VisitView; user: SessionUser; canWork: boolean }) {
  const [notes, dx] = await Promise.all([listConsultations(v.id), listDiagnoses(v.id)]);
  const mine = notes.find((n) => n.clinician_user_id === user.id && n.status === 'OPEN');
  const others = notes.filter((n) => n !== mine);
  const soapFields = (n?: typeof mine) => (
    <div className="soap-grid">
      <div className="full"><Field name="chief_complaint" label="Chief complaint" maxLength={2000} defaultValue={n?.chief_complaint ?? v.chief_complaint ?? ''} /></div>
      <Field name="history" label="History of presenting illness" type="textarea" rows={4} maxLength={8000} defaultValue={n?.history ?? ''} />
      <Field name="past_history" label="Past medical / surgical history" type="textarea" rows={4} maxLength={8000} defaultValue={n?.past_history ?? ''} />
      <Field name="family_social_history" label="Family & social history" type="textarea" rows={3} maxLength={8000} defaultValue={n?.family_social_history ?? ''} />
      <Field name="review_of_systems" label="Review of systems" type="textarea" rows={3} maxLength={8000} defaultValue={n?.review_of_systems ?? ''} />
      <div className="full"><Field name="examination" label="Examination findings" type="textarea" rows={4} maxLength={8000} defaultValue={n?.examination ?? ''} /></div>
      <Field name="assessment" label="Assessment / impression" type="textarea" rows={3} maxLength={8000} defaultValue={n?.assessment ?? ''} />
      <Field name="plan" label="Plan" type="textarea" rows={3} maxLength={8000} defaultValue={n?.plan ?? ''} />
    </div>
  );
  return (
    <>
      {canWork ? (
        <EditableCard title="My clinical note (SOAP)" sub={mine ? `Started ${formatDateTime(mine.started_at)}` : 'Not started — Edit to begin; saving puts the patient in your room'} canEdit
          form={<InlineEditForm action={saveConsultationRequest.bind(null, v.no)} successTitle="Note saved">{soapFields(mine)}</InlineEditForm>}>
          {mine ? <SoapRead n={mine} /> : <EmptyState icon="📝" title="No note yet" />}
        </EditableCard>
      ) : null}
      <Card>
        <CardHead title="Diagnoses" sub="ICD-10 coded — feeds the morbidity report and the claim">
          {canWork ? (
            <ModalFormButton label="Add diagnosis" className="btn sm" title="Add a diagnosis" action={addDiagnosisRequest.bind(null, v.no)} successTitle="Diagnosis added">
              <IcdPicker />
              <Field name="diagnosis_type" label="Type" type="select" defaultValue={dx.length ? 'SECONDARY' : 'PRIMARY'} options={['PRIMARY', 'SECONDARY', 'PROVISIONAL'].map((t) => ({ value: t, label: humanise(t) }))} />
            </ModalFormButton>
          ) : null}
        </CardHead>
        {dx.length ? (
          <TableWrap><thead><tr><th>ICD-10</th><th>Diagnosis</th><th>Type</th><th>By</th><th /></tr></thead>
            <tbody>{dx.map((d) => (
              <tr key={d.id}><td className="mono">{d.icd_code ?? '—'}</td><td>{d.description}</td><td><Pill tone={d.diagnosis_type === 'PRIMARY' ? 'accent' : ''}>{humanise(d.diagnosis_type)}</Pill></td><td className="tiny">{d.created_by}</td>
                <td>{canWork ? <RunButton label="Remove" className="btn sm ghost" action={removeDiagnosisRequest.bind(null, d.id, v.no)} successTitle="Removed" /> : null}</td></tr>
            ))}</tbody></TableWrap>
        ) : <EmptyState icon="🩺" title="No diagnosis recorded" sub="At least one is needed to complete the consultation." />}
      </Card>
      {others.map((n) => <Card key={n.id}><CardHead title={n.clinician_name} sub={`${formatDateTime(n.started_at)} · ${humanise(n.status)}`} /><SoapRead n={n} /></Card>)}
    </>
  );
}

/* ------------------------------------------------------------------ orders */

async function OrdersTab({ v, allergies, canWork, canClaims }: { v: VisitView; allergies: string | null; canWork: boolean; canClaims: boolean }) {
  const [tests, imagingSvc, procSvc, drugs, labs, imaging, rx, procs, preauths] = await Promise.all([
    listLabTests(true), listServiceItems({ kind: 'IMAGING', activeOnly: true }),
    Promise.all([listServiceItems({ kind: 'PROCEDURE', activeOnly: true }), listServiceItems({ kind: 'NURSING', activeOnly: true })]).then(([a, b]) => [...a, ...b]),
    listDrugs({ activeOnly: true }), listVisitLabTests(v.id), listVisitImaging(v.id), listVisitPrescriptions(v.id), listVisitProcedures(v.id), listVisitPreauths(v.id),
  ]);
  return (
    <>
      <Card>
        <CardHead title="Laboratory" sub={`${labs.filter((l) => l.status !== 'CANCELLED').length} test(s) on this visit`}>
          {canWork ? (
            <ModalFormButton label="Request tests" className="btn sm" wide title="Laboratory request" action={orderLabRequest.bind(null, v.no)} submitLabel="Send to lab" successTitle="Sent to the lab">
              <MultiPick name="lab_test_ids" filterPlaceholder="Filter tests…" options={tests.map((t) => ({ id: t.id, label: t.name, group: humanise(t.section), sub: `${formatMoney(t.price ?? 0)} · ${humanise(t.specimen_type)} · ${t.tat_minutes} min` }))} />
              <div className="grid g2">
                <Field name="priority" label="Priority" type="select" defaultValue="ROUTINE" options={['ROUTINE', 'URGENT', 'STAT'].map((p) => ({ value: p, label: humanise(p) }))} />
                <Field name="clinical_notes" label="Clinical notes for the lab" maxLength={1000} />
              </div>
            </ModalFormButton>
          ) : null}
        </CardHead>
        {labs.length ? (
          <TableWrap><thead><tr><th>Request</th><th>Test</th><th>Specimen</th><th>Status</th><th /></tr></thead>
            <tbody>{labs.map((l) => (
              <tr key={l.id}><td className="mono">{l.order_no}</td><td>{l.test_name}</td><td className="mono tiny">{l.specimen_no ?? '—'}</td>
                <td><Pill status={l.status} />{l.critical ? <span className="flag HH" style={{ marginLeft: 6 }}>CRIT</span> : l.abnormal ? <span className="flag H" style={{ marginLeft: 6 }}>ABN</span> : null}</td>
                <td>{l.status === 'VERIFIED' ? <Link className="btn sm ghost" href={`/visits/${v.no}/results`}>Result</Link> : null}</td></tr>
            ))}</tbody></TableWrap>
        ) : <EmptyState icon="🧪" title="No tests requested" />}
      </Card>

      <Card>
        <CardHead title="Prescription" sub="Sent to the pharmacy queue — allergies are checked as you prescribe" />
        {canWork ? <PrescriptionBuilder visitNo={v.no} allergies={allergies}
          drugs={drugs.map((d) => ({ id: d.id, label: `${d.generic_name}${d.strength ? ` ${d.strength}` : ''} ${humanise(d.dosage_form).toLowerCase()}${d.brand_name ? ` (${d.brand_name})` : ''}`, form: d.dosage_form, route: d.default_route, frequency: d.default_frequency, stock: Number(d.stock ?? 0), price: Number(d.price ?? 0) }))} /> : null}
        {rx.length ? (
          <TableWrap><thead><tr><th>Rx</th><th>Drug</th><th>Dose</th><th>Freq</th><th className="num">Days</th><th className="num">Qty</th><th>Status</th></tr></thead>
            <tbody>{rx.map((l) => (
              <tr key={l.id}><td className="mono">{l.rx_no}</td><td>{l.generic_name} {l.strength ?? ''}<div className="tiny muted-cell">{l.instructions ?? ''}</div></td><td>{l.dose} {l.route}</td><td>{l.frequency}</td>
                <td className="num">{l.duration_days}</td><td className="num">{l.dispensed_qty || l.quantity}</td><td><Pill status={l.status} /></td></tr>
            ))}</tbody></TableWrap>
        ) : null}
      </Card>

      <div className="grid g2">
        <Card>
          <CardHead title="Imaging">
            {canWork ? (
              <ModalFormButton label="Request study" className="btn sm" title="Imaging request" action={orderImagingRequest.bind(null, v.no)} submitLabel="Request" successTitle="Study requested">
                <Field name="service_item_id" label="Study" type="select" required options={[{ value: '', label: '…' }, ...imagingSvc.map((s) => ({ value: s.id, label: `${s.name} — ${formatMoney(s.base_price)}` }))]} />
                <div className="grid g3">
                  <Field name="modality" label="Modality" type="select" options={[{ value: '', label: '— from the study —' }, ...MODALITIES.map((m) => ({ value: m, label: m }))]} />
                  <Field name="body_part" label="Region" maxLength={80} />
                  <Field name="priority" label="Priority" type="select" defaultValue="ROUTINE" options={['ROUTINE', 'URGENT', 'STAT'].map((p) => ({ value: p, label: humanise(p) }))} />
                </div>
                <Field name="clinical_notes" label="Clinical question" maxLength={1000} />
              </ModalFormButton>
            ) : null}
          </CardHead>
          {imaging.length ? <TableWrap><thead><tr><th>No.</th><th>Study</th><th>Status</th></tr></thead>
            <tbody>{imaging.map((o) => <tr key={o.id}><td className="mono">{o.no}</td><td>{o.service_name}{o.body_part ? ` — ${o.body_part}` : ''}</td><td><Pill status={o.status} /></td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="🩻" title="No studies" />}
        </Card>
        <Card>
          <CardHead title="Procedures & nursing">
            {canWork ? (
              <ModalFormButton label="Add" className="btn sm" title="Procedure / nursing service" action={orderProcedureRequest.bind(null, v.no)} submitLabel="Save" successTitle="Recorded">
                <Field name="service_item_id" label="Service" type="select" required options={[{ value: '', label: '…' }, ...procSvc.map((s) => ({ value: s.id, label: `${s.name} — ${formatMoney(s.base_price)}`, group: humanise(s.kind) }))]} />
                <div className="grid g2">
                  <Field name="quantity" label="Quantity" type="number" min={1} max={50} defaultValue={1} />
                  <Field name="performed" label="Already done (I did it now)" type="checkbox" defaultValue={0} />
                </div>
                <Field name="notes" label="Notes" maxLength={1000} />
              </ModalFormButton>
            ) : null}
          </CardHead>
          {procs.length ? <TableWrap><thead><tr><th>Service</th><th className="num">Qty</th><th>Status</th></tr></thead>
            <tbody>{procs.map((p) => <tr key={p.id}><td>{p.description}<div className="tiny muted-cell">{p.notes ?? ''}</div></td><td className="num">{p.quantity}</td><td><Pill status={p.status} /></td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="💉" title="None" />}
        </Card>
      </div>

      {v.scheme_id ? (
        <Card>
          <CardHead title="Pre-authorisations" sub={`With ${v.scheme_name}`}>
            {canClaims && v.status === 'OPEN' ? (
              <ModalFormButton label="Request pre-auth" className="btn sm" title="Request pre-authorisation" action={requestPreauthRequest.bind(null, v.no)} submitLabel="Record request" successTitle="Pre-authorisation requested">
                <Field name="description" label="What is being authorised" required maxLength={300} />
                <Field name="requested_amount" label="Amount" type="currency" required />
                <Field name="notes" label="Notes" maxLength={1000} />
              </ModalFormButton>
            ) : null}
          </CardHead>
          {preauths.length ? <TableWrap><thead><tr><th>No.</th><th>For</th><th className="num">Requested</th><th className="num">Approved</th><th>Code</th><th>Status</th></tr></thead>
            <tbody>{preauths.map((p) => <tr key={p.id}><td className="mono">{p.no}</td><td>{p.description}</td><td className="num">{formatMoney(p.requested_amount)}</td><td className="num">{p.approved_amount != null ? formatMoney(p.approved_amount) : '—'}</td><td className="mono">{p.auth_code ?? '—'}</td><td><Pill status={p.status} /></td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="🔏" title="None requested" />}
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ results */

async function ResultsTab({ v }: { v: VisitView }) {
  const [labs, imaging] = await Promise.all([listVisitLabTests(v.id), listVisitImaging(v.id)]);
  const released = labs.filter((l) => l.status === 'VERIFIED' || l.status === 'RESULTED');
  const detail = await Promise.all(released.map(async (t) => ({ t, params: await listLabParameters(t.lab_test_id), results: new Map((await listResults(t.id)).map((r) => [r.parameter_id, r])) })));
  const orders = [...new Set(released.map((l) => l.order_no))];
  return (
    <>
      {detail.length ? detail.map(({ t, params, results }) => (
        <Card key={t.id}>
          <CardHead title={t.test_name} sub={`${t.order_no} · specimen ${t.specimen_no ?? '—'} · ${t.status === 'VERIFIED' ? `released ${formatDateTime(t.verified_at)} by ${t.verified_by ?? 'lab'}` : 'awaiting verification'}`}>
            {t.status === 'VERIFIED' ? <Pill tone="ok">Released</Pill> : <Pill tone="warn">Preliminary</Pill>}
          </CardHead>
          <TableWrap><thead><tr><th>Parameter</th><th className="num">Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
            <tbody>{params.map((p) => { const r = results.get(p.id); return r ? (
              <tr key={p.id}><td>{p.name}</td><td className="num"><b>{r.value_num ?? r.value_text}</b></td><td className="tiny">{p.unit ?? ''}</td><td className="tiny">{rangeText(p, t.sex)}</td><td><span className={`flag ${r.flag}`}>{r.flag === 'N' ? '' : r.flag}</span></td></tr>
            ) : null; })}</tbody></TableWrap>
          {t.comment ? <div className="note-box stack-2">{t.comment}</div> : null}
        </Card>
      )) : <Card><EmptyState icon="🧪" title="No lab results yet" sub={labs.length ? 'Tests are with the lab.' : 'No tests were requested.'} /></Card>}
      {orders.map((o) => <Link key={o} className="btn ghost sm" style={{ marginRight: 6 }} target="_blank" href={`/clinic-print/lab/${o}`}>Print lab report {o}</Link>)}
      {imaging.filter((i) => i.status === 'REPORTED').map((i) => (
        <Card key={i.id}>
          <CardHead title={`${i.service_name}${i.body_part ? ` — ${i.body_part}` : ''}`} sub={`${i.no} · reported ${formatDateTime(i.reported_at)} by ${i.reported_by}`}>
            {i.image_url ? <a className="btn sm ghost" href={i.image_url} target="_blank" rel="noreferrer">View images</a> : null}
          </CardHead>
          <DefinitionList items={[['Findings', <div key="f" style={{ whiteSpace: 'pre-wrap' }}>{i.findings}</div>], ['Impression', <b key="i">{i.impression}</b>]]} />
        </Card>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ dental */

async function DentalTab({ v, canWork }: { v: VisitView; canWork: boolean }) {
  const [chart, plans, dentalSvc] = await Promise.all([currentChart(v.patient_id), listPlans(v.patient_id), listServiceItems({ kind: 'DENTAL', activeOnly: true })]);
  const path = `/visits/${v.no}/dental`;
  const active = plans.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status));
  const items = await Promise.all(active.map((p) => listPlanItems(p.id)));
  return (
    <>
      <Card>
        <CardHead title="Odontogram" sub="Click teeth, choose the finding and surfaces, record — saved against this visit" />
        <Odontogram entries={chart} conditions={DENTAL_CONDITIONS} adult={ADULT_TEETH} primary={PRIMARY_TEETH} visitId={v.id}
          onRecord={canWork && v.status === 'OPEN' ? recordFindingRequest.bind(null, v.patient_id, path) : undefined} />
      </Card>
      <Card>
        <CardHead title="Treatment plans" sub="Quote, accept, then do and charge each item on the visit it is done">
          {canWork ? (
            <ModalFormButton label="New plan" className="btn sm" title="New treatment plan" action={createPlanRequest.bind(null, v.patient_id, path)} submitLabel="Create" successTitle="Plan created">
              <input type="hidden" name="visit_id" value={v.id} />
              <Field name="title" label="Title" required maxLength={120} placeholder="e.g. Restorative phase — upper arch" />
              <Field name="notes" label="Notes" type="textarea" rows={2} maxLength={2000} />
            </ModalFormButton>
          ) : null}
        </CardHead>
        {active.length ? active.map((p, i) => (
          <div key={p.no} className="stack-2">
            <div className="toolbar">
              <b>{p.no} — {p.title}</b> <Pill status={p.status} />
              <span className="tiny muted-cell">{p.done}/{p.items} done · quoted {formatMoney(p.total)}</span>
              <Spacer />
              <Link className="btn sm ghost" target="_blank" href={`/clinic-print/dental-plan/${p.no}`}>Print quote</Link>
              {canWork && p.status === 'PROPOSED' ? <RunButton label="Patient accepts" className="btn sm" action={planStatusRequest.bind(null, p.no, 'ACCEPTED', path)} successTitle="Plan accepted" /> : null}
              {canWork ? (
                <ModalFormButton label="Add procedure" className="btn sm ghost" title={`Add to ${p.no}`} action={addPlanItemRequest.bind(null, p.no, path)} successTitle="Added">
                  <Field name="service_item_id" label="Procedure" type="select" required options={[{ value: '', label: '…' }, ...dentalSvc.map((s) => ({ value: s.id, label: `${s.code} · ${s.name} — ${formatMoney(s.base_price)}` }))]} />
                  <div className="grid g4">
                    <Field name="teeth" label="Teeth (FDI, comma-sep.)" maxLength={60} placeholder="e.g. 16, 26" />
                    <Field name="surfaces" label="Surfaces" maxLength={5} placeholder="MOD" />
                    <Field name="phase" label="Phase" type="number" min={1} max={5} defaultValue={1} />
                    <Field name="fee" label="Fee each (blank = tariff)" type="currency" />
                  </div>
                </ModalFormButton>
              ) : null}
            </div>
            <TableWrap><thead><tr><th>Ph.</th><th>Tooth</th><th>Procedure</th><th className="num">Fee</th><th>Status</th><th /></tr></thead>
              <tbody>{items[i].map((it) => (
                <tr key={it.id}><td>{it.phase}</td><td className="mono">{it.tooth ?? '—'}{it.surfaces ? ` ${it.surfaces}` : ''}</td><td>{it.description}</td><td className="num">{formatMoney(it.fee)}</td><td><Pill status={it.status} /></td>
                  <td>{canWork && it.status === 'PLANNED' && v.status === 'OPEN' ? (
                    <ModalFormButton label="Done today" className="btn sm" title={`Complete ${it.description}`} action={completePlanItemRequest.bind(null, it.id, path)} submitLabel="Complete & charge" successTitle="Done and charged">
                      <p>Charges {formatMoney(it.fee)} to visit {v.no}{it.tooth ? ` and updates tooth ${it.tooth} on the chart` : ''}.</p>
                      <Field name="notes" label="Notes" maxLength={300} />
                    </ModalFormButton>
                  ) : null}</td></tr>
              ))}</tbody></TableWrap>
          </div>
        )) : <EmptyState icon="🦷" title="No active plan" />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ billing */

async function BillingTab({ v, user }: { v: VisitView; user: SessionUser }) {
  const [charges, acc, payments, bill, services] = await Promise.all([
    listCharges(v.id), visitAccount(v.id), listVisitPayments(v.id), getBillByVisit(v.id), listServiceItems({ activeOnly: true }),
  ]);
  const final = bill?.status === 'FINAL';
  const canBill = canAction(user, 'CASHIER_BILL') && !final && v.status !== 'CANCELLED';
  const canDiscount = canAction(user, 'CASHIER_DISCOUNT') && !final;
  const canReceive = canAction(user, 'CASHIER_RECEIVE') && acc.balance > 0;
  return (
    <>
      <div className="grid g4 stack-2">
        <Stat label="Charges" value={formatMoney(acc.gross)} foot={acc.discount ? `less ${formatMoney(acc.discount)} discount` : `${charges.filter((c) => c.status !== 'CANCELLED').length} line(s)`} />
        <Stat accent={false} label={v.scheme_name ? `${v.scheme_name} pays` : 'Scheme pays'} value={formatMoney(acc.schemeShare)} />
        <Stat accent={false} label="Patient pays" value={formatMoney(acc.patientShare)} foot={`${formatMoney(acc.paid)} received`} />
        <Stat label="Balance due" value={<span className={acc.balance > 0 ? 'danger-text' : ''}>{formatMoney(acc.balance)}</span>} foot={final ? `Bill ${bill!.no} final` : 'bill still open'} />
      </div>
      <Toolbar>
        {canReceive ? (
          <ModalFormButton label="Receive payment" title={`Receive payment — ${v.patient_name}`} action={receivePaymentRequest.bind(null, v.no)} submitLabel="Receipt" successTitle="Payment received">
            <div className="grid g2">
              <Field name="method" label="Method" type="select" required defaultValue="CASH" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m === 'MPESA' ? 'M-Pesa' : humanise(m) }))} />
              <Field name="amount" label={`Amount (due ${formatMoney(acc.balance)})`} type="currency" defaultValue={(acc.balance / 100).toFixed(2)} />
            </div>
            <div className="grid g2">
              <Field name="reference" label="M-Pesa code / card or bank reference" maxLength={40} uppercase />
              <Field name="tendered" label="Cash tendered (for change)" type="currency" />
            </div>
          </ModalFormButton>
        ) : null}
        {canBill ? (
          <ModalFormButton label="Add charge" className="btn ghost" title="Add a charge" action={addChargeRequest.bind(null, v.no)} successTitle="Charge added">
            <Field name="service_item_id" label="Service" type="select" required options={[{ value: '', label: '…' }, ...services.filter((s) => s.kind !== 'DRUG').map((s) => ({ value: s.id, label: `${s.name} — ${formatMoney(s.base_price)}`, group: humanise(s.kind) }))]} />
            <div className="grid g2"><Field name="quantity" label="Quantity" type="number" min={0.01} step="0.01" defaultValue={1} /><Field name="description" label="Description (optional)" maxLength={200} /></div>
          </ModalFormButton>
        ) : null}
        <Spacer />
        {final ? <Link className="btn ghost" target="_blank" href={`/clinic-print/bill/${bill!.no}`}>Print invoice</Link> : null}
        {canBill && charges.some((c) => c.status === 'OPEN') ? (
          <RunButton label="Finalise bill & close visit" action={finaliseBillRequest.bind(null, v.no)} successTitle="Bill finalised"
            confirm={{ title: 'Finalise the bill?', message: `Posts ${formatMoney(acc.net)} of revenue${acc.schemeShare ? ` and raises a ${formatMoney(acc.schemeShare)} claim to ${v.scheme_name}` : ''}, and closes the visit. No more charges can be added.` }} />
        ) : null}
      </Toolbar>
      <Card>
        <CardHead title="Charges" sub={`Priced on the ${v.price_list_code} tariff`} />
        {charges.length ? (
          <TableWrap>
            <thead><tr><th>When</th><th>Service</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Amount</th><th className="num">Discount</th>{v.scheme_id ? <th className="num">Scheme</th> : null}<th>Status</th><th /></tr></thead>
            <tbody>{charges.map((c) => (
              <tr key={c.id} style={c.status === 'CANCELLED' ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                <td className="tiny">{formatDateTime(c.charged_at)}</td><td>{c.description}<div className="tiny muted-cell">{humanise(c.source_type)} · {c.charged_by}{c.cancel_reason ? ` · ${c.cancel_reason}` : ''}</div></td>
                <td className="num">{c.quantity}</td><td className="num">{formatMoney(c.unit_price)}</td><td className="num">{formatMoney(c.amount)}</td>
                <td className="num">{c.discount ? formatMoney(c.discount) : ''}</td>{v.scheme_id ? <td className="num">{c.status === 'BILLED' ? formatMoney(c.scheme_amount) : ''}</td> : null}
                <td><Pill status={c.status} /></td>
                <td>{c.status === 'OPEN' ? (
                  <span className="inline" style={{ gap: 4 }}>
                    {canDiscount ? (
                      <ModalFormButton label="Discount" className="btn sm ghost" title={`Discount — ${c.description}`} action={discountChargeRequest.bind(null, c.id, v.no)} successTitle="Discount applied">
                        <div className="grid g2"><Field name="discount" label="Amount" type="currency" /><Field name="discount_pct" label="…or %" type="number" min={0} max={100} /></div>
                        <Field name="reason" label="Reason / authority" required maxLength={300} />
                      </ModalFormButton>
                    ) : null}
                    {canBill ? (
                      <ModalFormButton label="Cancel" className="btn sm ghost danger" submitClass="btn danger" title={`Cancel — ${c.description}`} action={cancelChargeRequest.bind(null, c.id, v.no)} submitLabel="Cancel charge" successTitle="Charge cancelled">
                        <Field name="reason" label="Reason" required maxLength={300} />
                      </ModalFormButton>
                    ) : null}
                  </span>
                ) : null}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="🧾" title="No charges yet" />}
      </Card>
      <Card>
        <CardHead title="Receipts" />
        {payments.length ? (
          <TableWrap><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>By</th><th>Status</th><th /></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}><td className="mono">{p.no}</td><td>{formatDate(p.payment_date)}</td><td>{p.method === 'MPESA' ? 'M-Pesa' : humanise(p.method)}</td><td className="mono">{p.reference ?? '—'}</td>
                <td className="num">{formatMoney(p.amount)}</td><td className="tiny">{p.received_by}</td><td><Pill status={p.status} /></td>
                <td className="inline" style={{ gap: 4 }}>
                  <Link className="btn sm ghost" target="_blank" href={`/clinic-print/receipt/${p.no}`}>Print</Link>
                  {p.status === 'POSTED' && canAction(user, 'CASHIER_VOID') ? (
                    <ModalFormButton label="Void" className="btn sm ghost danger" submitClass="btn danger" title={`Void ${p.no}`} action={voidPaymentRequest.bind(null, p.no)} submitLabel="Void receipt" successTitle="Receipt voided">
                      <Field name="reason" label="Reason" required maxLength={300} />
                    </ModalFormButton>
                  ) : null}
                </td></tr>
            ))}</tbody></TableWrap>
        ) : <EmptyState icon="💳" title="Nothing received yet" />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ documents */

async function DocumentsTab({ v, canWork }: { v: VisitView; canWork: boolean }) {
  const docs = await listVisitDocuments(v.id);
  return (
    <Card>
      <CardHead title="Referrals, sick notes & reports" sub="Printed on the clinic's letterhead">
        {canWork ? (
          <span className="inline" style={{ gap: 6 }}>
            <ModalFormButton label="Referral" className="btn sm" wide title="Referral letter" action={issueDocumentRequest.bind(null, v.no)} submitLabel="Issue" successTitle="Referral issued">
              <input type="hidden" name="doc_type" value="REFERRAL" />
              <div className="grid g3">
                <Field name="referred_to" label="Referred to (facility / doctor)" required maxLength={160} />
                <Field name="specialty" label="Specialty" maxLength={80} />
                <Field name="urgency" label="Urgency" type="select" defaultValue="ROUTINE" options={['ROUTINE', 'URGENT', 'EMERGENCY'].map((u) => ({ value: u, label: humanise(u) }))} />
              </div>
              <Field name="body" label="Reason for referral, findings and treatment given" type="textarea" rows={7} required maxLength={6000} />
            </ModalFormButton>
            <ModalFormButton label="Sick note" className="btn sm ghost" title="Sick-off note" action={issueDocumentRequest.bind(null, v.no)} submitLabel="Issue" successTitle="Sick note issued">
              <input type="hidden" name="doc_type" value="SICK_NOTE" />
              <div className="grid g2"><Field name="from_date" label="From" type="date" required defaultValue={today()} /><Field name="to_date" label="To" type="date" required /></div>
              <Field name="body" label="Remarks (no diagnosis unless the patient consents)" type="textarea" rows={3} required maxLength={2000} defaultValue="Was seen at this facility and is unfit for duty for the period stated." />
            </ModalFormButton>
            <ModalFormButton label="Medical report" className="btn sm ghost" wide title="Medical report" action={issueDocumentRequest.bind(null, v.no)} submitLabel="Issue" successTitle="Report issued">
              <input type="hidden" name="doc_type" value="MEDICAL_REPORT" />
              <Field name="body" label="Report" type="textarea" rows={10} required maxLength={6000} />
            </ModalFormButton>
          </span>
        ) : null}
      </CardHead>
      {docs.length ? (
        <TableWrap><thead><tr><th>No.</th><th>Type</th><th>Details</th><th>Issued</th><th /></tr></thead>
          <tbody>{docs.map((d) => (
            <tr key={d.id}><td className="mono">{d.no}</td><td>{humanise(d.doc_type)}</td>
              <td className="tiny">{d.doc_type === 'REFERRAL' ? `To ${d.referred_to}${d.specialty ? ` (${d.specialty})` : ''}` : d.doc_type === 'SICK_NOTE' ? `${formatDate(d.from_date)} – ${formatDate(d.to_date)}` : d.body.slice(0, 80)}</td>
              <td className="tiny">{formatDateTime(d.issued_at)} · {d.issued_by}</td>
              <td><Link className="btn sm ghost" target="_blank" href={`/clinic-print/document/${d.no}`}>Print</Link></td></tr>
          ))}</tbody></TableWrap>
      ) : <EmptyState icon="📄" title="No documents issued" />}
    </Card>
  );
}
