import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import {
  getPatient, listCovers, patientTimeline, latestVitals, vitalsHistory, patientAccount, maskedIdNumber,
} from '@/lib/clinic/patients';
import { upcomingForPatient } from '@/lib/clinic/appointments';
import { currentChart, chartHistory, listPlans, DENTAL_CONDITIONS, ADULT_TEETH, PRIMARY_TEETH } from '@/lib/clinic/dental';
import { resultHistory } from '@/lib/clinic/lab';
import { formatDate, formatDateTime, humanise, formatMoney } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, DefinitionList, EmptyState, Pill, Stat, TableWrap, Toolbar, Spacer, Tabs } from '@/components/ui/primitives';
import { EditableCard } from '@/components/ui/editable-card';
import { InlineEditForm } from '@/components/ui/inline-edit-form';
import { ModalFormButton, RevealButton, RunButton } from '@/components/ui/modal-form';
import { PatientBanner, VitalsStrip } from '@/components/clinic/patient-banner';
import { Odontogram } from '@/components/clinic/odontogram';
import { PatientFields, CoverFields, CheckInFields, BookingFields } from '@/components/clinic/fields';
import { Trend } from '@/components/charts/trend';
import {
  updatePatientRequest, addCoverRequest, endCoverRequest, defaultCoverRequest, checkInRequest, revealPatientIdRequest,
  bookAppointmentRequest, recordFindingRequest,
} from '@/app/actions/clinic';

const TABS = [
  { key: 'summary', label: 'Summary' }, { key: 'visits', label: 'Visits' }, { key: 'results', label: 'Lab results' },
  { key: 'dental', label: 'Dental chart' }, { key: 'details', label: 'Details & cover' },
];

export default async function PatientChart({ params, searchParams }: {
  params: Promise<{ mrn: string }>; searchParams: Promise<{ tab?: string; checkin?: string; appt?: string; dept?: string }>;
}) {
  const user = await requireAction('PATIENTS_READ');
  const { mrn: raw } = await params;
  const { tab = 'summary', checkin, appt, dept } = await searchParams;
  const p = await getPatient(decodeURIComponent(raw));
  if (!p) notFound();
  const [covers, timeline, vitals, trend, account, upcoming] = await Promise.all([
    listCovers(p.id), patientTimeline(p.id), latestVitals(p.id), vitalsHistory(p.id), patientAccount(p.id), upcomingForPatient(p.id),
  ]);
  const canManage = canAction(user, 'PATIENTS_MANAGE');
  const canCheckIn = canAction(user, 'VISITS_CHECK_IN') && !p.open_visit_no && p.status === 'ACTIVE';
  const defaultCover = covers.find((c) => c.is_default && c.status === 'ACTIVE');
  const path = `/patients/${p.mrn}`;

  return (
    <Page title={p.full_name} crumb={`Patient chart · ${p.mrn} · registered ${formatDate(p.created_at)}`} user={user}>
      <PatientBanner link={false} p={{ ...p, payer: defaultCover ? `${defaultCover.scheme_name} · ${defaultCover.member_no}` : 'Cash' }} right={(
        <>
          {p.open_visit_no ? <Link className="btn" href={`/visits/${p.open_visit_no}`}>Open visit {p.open_visit_no} →</Link> : null}
          {canCheckIn ? (
            <ModalFormButton label={checkin || appt ? 'Check in now' : 'Check in'} title={`Check in ${p.full_name}`} wide action={checkInRequest} submitLabel="Check in"
              successTitle="Checked in" redirectPrefix="/visits/" redirectField="no" className={checkin || appt ? 'btn' : 'btn'}>
              <CheckInFields patientId={p.id} appointmentNo={appt ?? null} departmentCode={dept ?? null} />
            </ModalFormButton>
          ) : null}
          {canAction(user, 'APPOINTMENTS_MANAGE') ? (
            <ModalFormButton label="Book appointment" className="btn ghost" title={`Book ${p.full_name}`} wide action={bookAppointmentRequest} submitLabel="Book" successTitle="Booked">
              <BookingFields patientId={p.id} patientLabel={`${p.full_name} · ${p.mrn}`} />
            </ModalFormButton>
          ) : null}
        </>
      )} />
      {checkin || appt ? <div className="callout stack-2">{appt ? `Arriving for appointment ${appt}. ` : ''}Use <b>Check in now</b> above to open today’s visit.</div> : null}

      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'summary' ? path : `${path}?tab=${k}`)} />

      {tab === 'summary' ? (
        <>
          <div className="grid g4 stack-2">
            <Stat label="Visits" value={timeline.filter((t) => t.status !== 'CANCELLED').length} foot={p.last_visit_date ? `last ${formatDate(p.last_visit_date)}` : 'first visit pending'} />
            <Stat accent={false} label="Owing" value={formatMoney(Math.max(account.balance, 0))} foot={account.balance < 0 ? `${formatMoney(-account.balance)} on deposit` : 'patient share of final bills'} />
            <Stat accent={false} label="Next appointment" value={upcoming[0] ? formatDate(upcoming[0].appointment_date) : '—'} foot={upcoming[0] ? `${upcoming[0].start_time} · ${upcoming[0].department_name}` : undefined} small />
            <Stat accent={false} label="Cover" value={defaultCover?.scheme_code ?? 'Cash'} foot={defaultCover?.member_no} small />
          </div>
          <Card>
            <CardHead title="Latest vitals" sub={vitals ? `Recorded ${formatDateTime(vitals.recorded_at)}` : 'No triage on record yet'} />
            {vitals ? <VitalsStrip t={vitals} /> : <EmptyState icon="🩺" title="No vitals yet" />}
            {trend.length > 1 ? (
              <div className="grid g2 stack-2">
                <div><div className="tiny muted-cell">Blood pressure (systolic / diastolic)</div>
                  <Trend money={false} height={180} labels={trend.map((t) => t.recorded_at.slice(5, 10))} series={[
                    { name: 'Systolic', color: 'var(--series-1)', values: trend.map((t) => t.bp_systolic ?? 0) },
                    { name: 'Diastolic', color: 'var(--series-2)', values: trend.map((t) => t.bp_diastolic ?? 0) }]} /></div>
                <div><div className="tiny muted-cell">Weight (kg)</div>
                  <Trend money={false} height={180} labels={trend.map((t) => t.recorded_at.slice(5, 10))} series={[{ name: 'Weight', color: 'var(--series-3)', values: trend.map((t) => t.weight_kg ?? 0) }]} /></div>
              </div>
            ) : null}
          </Card>
          <Card>
            <CardHead title="Recent visits" sub="Open a visit for its notes, results and bill"><Link className="btn sm ghost" href={`${path}?tab=visits`}>All visits</Link></CardHead>
            <VisitTable rows={timeline.slice(0, 6)} />
          </Card>
          {upcoming.length ? (
            <Card>
              <CardHead title="Upcoming appointments" />
              <TableWrap><thead><tr><th>No.</th><th>Date</th><th>Time</th><th>Clinic</th><th>With</th><th>Status</th></tr></thead>
                <tbody>{upcoming.map((a) => <tr key={a.no}><td className="mono">{a.no}</td><td>{formatDate(a.appointment_date)}</td><td>{a.start_time}</td><td>{a.department_name}</td><td>{a.clinician_name ?? '—'}</td><td><Pill status={a.status} /></td></tr>)}</tbody>
              </TableWrap>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'visits' ? <Card><VisitTable rows={timeline} /></Card> : null}

      {tab === 'results' ? <ResultsTab patientId={p.id} /> : null}

      {tab === 'dental' ? <DentalTab patientId={p.id} path={path} canWork={canAction(user, 'DENTAL_WORK')} /> : null}

      {tab === 'details' ? (
        <>
          <EditableCard title="Demographics" canEdit={canManage}
            form={canManage ? <InlineEditForm action={updatePatientRequest.bind(null, p.mrn)} successTitle="Patient updated"><PatientFields p={p} /></InlineEditForm> : null}>
            <div className="grid g3">
              <DefinitionList items={[
                ['Name', `${p.title ? `${p.title} ` : ''}${p.full_name}`], ['Sex', humanise(p.sex)],
                ['Date of birth', p.date_of_birth ? `${formatDate(p.date_of_birth)}${p.dob_estimated ? ' (estimated)' : ''}` : '—'],
                ['Marital status', humanise(p.marital_status) || '—'], ['Occupation', p.occupation ?? '—'],
              ]} />
              <DefinitionList items={[
                [humanise(p.id_type), canAction(user, 'PATIENTS_PII_VIEW') ? <RevealButton key="id" masked={maskedIdNumber(p)} action={revealPatientIdRequest.bind(null, p.mrn)} /> : (maskedIdNumber(p) ?? '—')],
                ['Phone', [p.phone, p.alt_phone].filter(Boolean).join(' / ') || '—'], ['E-mail', p.email ?? '—'], ['Address', p.address ?? '—'],
                ['SMS reminders', p.sms_consent ? 'Yes' : 'No'],
              ]} />
              <DefinitionList items={[
                ['Next of kin', p.next_of_kin_name ? `${p.next_of_kin_name}${p.next_of_kin_relation ? ` (${p.next_of_kin_relation})` : ''}` : '—'],
                ['Next of kin phone', p.next_of_kin_phone ?? '—'], ['Blood group', p.blood_group ?? 'Unknown'], ['Status', <Pill key="s" status={p.status} />],
              ]} />
            </div>
          </EditableCard>
          <Card>
            <CardHead title="Medical cover" sub="Insurance, SHA and corporate memberships — the default one is proposed at check-in">
              {canManage ? <ModalFormButton label="Add cover" className="btn sm" title="Add medical cover" wide action={addCoverRequest.bind(null, p.id, p.mrn)} successTitle="Cover added"><CoverFields /></ModalFormButton> : null}
            </CardHead>
            {covers.length ? (
              <TableWrap>
                <thead><tr><th>Scheme</th><th>Member no.</th><th>Principal</th><th>Relationship</th><th>Valid</th><th>Status</th><th /></tr></thead>
                <tbody>{covers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.scheme_name}{c.is_default ? <> <Pill tone="info">default</Pill></> : null}</td><td className="mono">{c.member_no}</td><td>{c.principal_name ?? '—'}</td>
                    <td>{humanise(c.relationship)}</td><td className="tiny">{c.valid_from ? formatDate(c.valid_from) : '…'} – {c.valid_to ? formatDate(c.valid_to) : 'open'}</td>
                    <td><Pill status={c.status} /></td>
                    <td>{canManage && c.status === 'ACTIVE' ? (
                      <span className="inline" style={{ gap: 4 }}>
                        {!c.is_default ? <RunButton label="Make default" className="btn sm ghost" action={defaultCoverRequest.bind(null, c.id, p.mrn)} successTitle="Default cover set" /> : null}
                        <RunButton label="End" className="btn sm ghost danger" action={endCoverRequest.bind(null, c.id, p.mrn)} successTitle="Cover ended" confirm={{ title: 'End this cover?', message: 'It will no longer be offered at check-in.' }} />
                      </span>
                    ) : null}</td>
                  </tr>
                ))}</tbody>
              </TableWrap>
            ) : <EmptyState icon="🏥" title="Cash patient" sub="No medical cover on file." />}
          </Card>
        </>
      ) : null}
      <Toolbar><Spacer /><Link className="btn ghost sm" href="/patients">← Patients</Link></Toolbar>
    </Page>
  );
}

function VisitTable({ rows }: { rows: Awaited<ReturnType<typeof patientTimeline>> }) {
  if (!rows.length) return <EmptyState icon="📋" title="No visits yet" />;
  return (
    <TableWrap>
      <thead><tr><th>Visit</th><th>Date</th><th>Clinic</th><th>Seen by</th><th>Diagnoses</th><th>Payer</th><th className="num">Bill</th><th>Status</th></tr></thead>
      <tbody>{rows.map((v) => (
        <tr key={v.id}>
          <td className="mono"><Link href={`/visits/${v.no}`}>{v.no}</Link></td><td>{formatDate(v.visit_date)}</td>
          <td><span className="info-chip" style={{ background: 'transparent', borderLeft: `4px solid ${v.department_colour}`, borderRadius: 0 }}>{v.department_name}</span></td>
          <td className="tiny">{v.clinician_name ?? '—'}</td><td className="tiny">{v.diagnoses ?? '—'}</td>
          <td className="tiny">{v.scheme_name ?? 'Cash'}</td><td className="num">{v.net != null ? formatMoney(v.net) : '—'}</td>
          <td><Pill status={v.status === 'OPEN' ? v.stage : v.status}>{humanise(v.status === 'OPEN' ? v.stage : v.status)}</Pill></td>
        </tr>
      ))}</tbody>
    </TableWrap>
  );
}

async function ResultsTab({ patientId }: { patientId: number }) {
  const rows = await resultHistory(patientId);
  return (
    <Card>
      <CardHead title="Released lab results" sub="Every verified result, newest first" />
      {rows.length ? (
        <TableWrap>
          <thead><tr><th>Released</th><th>Test</th><th>Parameter</th><th className="num">Result</th><th>Unit</th><th>Flag</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}><td className="tiny">{formatDateTime(r.verified_at)}</td><td>{r.test_name}</td><td>{r.parameter}</td>
              <td className="num">{r.value_num ?? r.value_text}</td><td className="tiny">{r.unit ?? ''}</td><td><span className={`flag ${r.flag}`}>{r.flag === 'N' ? '' : r.flag}</span></td></tr>
          ))}</tbody>
        </TableWrap>
      ) : <EmptyState icon="🧪" title="No released results" />}
    </Card>
  );
}

async function DentalTab({ patientId, path, canWork }: { patientId: number; path: string; canWork: boolean }) {
  const [chart, history, plans] = await Promise.all([currentChart(patientId), chartHistory(patientId), listPlans(patientId)]);
  return (
    <>
      <Card>
        <CardHead title="Odontogram" sub="FDI numbering — click teeth, choose the finding, record" />
        <Odontogram entries={chart} conditions={DENTAL_CONDITIONS} adult={ADULT_TEETH} primary={PRIMARY_TEETH}
          onRecord={canWork ? recordFindingRequest.bind(null, patientId, `${path}`) : undefined} />
      </Card>
      <Card>
        <CardHead title="Treatment plans" />
        {plans.length ? (
          <TableWrap><thead><tr><th>Plan</th><th>Title</th><th>Status</th><th className="num">Items</th><th className="num">Quoted</th><th className="num">Done</th></tr></thead>
            <tbody>{plans.map((pl) => <tr key={pl.no}><td className="mono"><Link href={`/dental/plan/${pl.no}`}>{pl.no}</Link></td><td>{pl.title}</td><td><Pill status={pl.status} /></td>
              <td className="num">{pl.done}/{pl.items}</td><td className="num">{formatMoney(pl.total)}</td><td className="num">{formatMoney(pl.completed_total)}</td></tr>)}</tbody></TableWrap>
        ) : <EmptyState icon="🦷" title="No treatment plans" sub="Plans are started from a dental visit." />}
      </Card>
      <Card>
        <CardHead title="Chart history" />
        {history.length ? (
          <TableWrap><thead><tr><th>When</th><th>Tooth</th><th>Surfaces</th><th>Finding</th><th>Notes</th><th>By</th><th /></tr></thead>
            <tbody>{history.map((h) => <tr key={h.id}><td className="tiny">{formatDateTime(h.recorded_at)}</td><td className="mono">{h.tooth}</td><td>{h.surfaces ?? '—'}</td>
              <td>{DENTAL_CONDITIONS.find((c) => c.code === h.condition)?.label ?? h.condition}</td><td className="tiny">{h.notes ?? ''}</td><td className="tiny">{h.recorded_by}</td>
              <td>{h.status === 'SUPERSEDED' ? <span className="tiny muted-cell">superseded</span> : null}</td></tr>)}</tbody></TableWrap>
        ) : <EmptyState icon="🦷" title="Nothing charted yet" />}
      </Card>
    </>
  );
}
