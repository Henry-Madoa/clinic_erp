import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentCanAction } from '@/lib/session';
import { getOrgBrand } from '@/lib/org';
import * as R from '@/lib/clinic/reports';
import { queueCounts, listQueue, listVisits } from '@/lib/clinic/visits';
import { listAppointments } from '@/lib/clinic/appointments';
import { labCounts, labWorklist } from '@/lib/clinic/lab';
import { prescriptionQueue, lowStock } from '@/lib/clinic/pharmacy';
import { cashierQueue, collectionsSummary } from '@/lib/clinic/billing';
import { claimsByScheme, listPreauths } from '@/lib/clinic/claims';
import { dentalDay, listActivePlans } from '@/lib/clinic/dental';
import { myPendingWorkflowTaskCount } from '@/lib/workflow';
import { formatDate, formatMoney, humanise, today } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, EmptyState, Pill, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money';
import { KpiTile, LockedCard } from './shared';
import { MonthTrend, MixDonut, MagnitudeBars } from '../role-center-charts';
import { Acuity, ageSex } from '@/components/clinic/patient-banner';
import type { SessionUser } from '@/lib/types';

async function Shell({ user, title, children }: { user: SessionUser; title: string; children: ReactNode }) {
  const org = await getOrgBrand();
  return <Page title={title} crumb={`${org?.name ?? ''} · ${formatDate(today())}`} user={user}>{children}</Page>;
}

function QueueTiles({ counts }: { counts: Awaited<ReturnType<typeof queueCounts>> }) {
  return (
    <div className="queue-tiles">
      {counts.map((c) => (
        <Link key={c.code} href={`/queue/${c.code}`} className="queue-tile" style={{ ['--qc' as string]: c.colour }}>
          <div className="qt-name">{c.name}</div><div className="qt-num">{c.waiting}</div>
          <div className="qt-foot">waiting · {c.serving} in service{c.longest_mins ? ` · longest ${c.longest_mins}m` : ''}</div>
        </Link>
      ))}
    </div>
  );
}

function QueueTable({ code, rows, open }: { code: string; rows: Awaited<ReturnType<typeof listQueue>>; open: (visitNo: string) => string }) {
  if (!rows.length) return <EmptyState icon="✅" title="Nobody waiting" />;
  return (
    <TableWrap>
      <thead><tr><th>No.</th><th>Patient</th><th>Acuity</th><th>Waiting</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.slice(0, 12).map((r) => (
        <tr key={r.id} className={r.status === 'SERVING' ? 'q-serving' : r.status === 'CALLED' ? 'q-called' : ''}>
          <td className="queue-no">{r.queue_no}</td><td><b>{r.patient_name}</b><div className="tiny muted-cell">{r.mrn} · {ageSex(r.age, r.sex)}</div></td>
          <td><Acuity value={r.acuity} /></td><td className={r.waiting_mins > 60 ? 'wait-long' : ''}>{r.waiting_mins}m</td><td><Pill status={r.status} /></td>
          <td><Link className="btn sm" href={open(r.visit_no)}>Open</Link></td>
        </tr>
      ))}</tbody>
      {rows.length > 12 ? <tfoot><tr><td colSpan={6}><Link href={`/queue/${code}`}>All {rows.length} →</Link></td></tr></tfoot> : null}
    </TableWrap>
  );
}

/* ------------------------------------------------------------------ Medical Director */

export async function SuperRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('CLINIC_REPORTS_VIEW'))) return <Shell user={user} title="Medical Director"><LockedCard title="Clinic performance" /></Shell>;
  const r30 = R.defaultRange();
  const [today0, k, monthly, cats, payers, dx, counts, approvals] = await Promise.all([
    R.todayAtAGlance(), R.clinicKpis(r30), R.monthlyRevenue(12), R.revenueByCategory(r30), R.revenueByPayer(r30), R.topDiagnoses(r30, 8), queueCounts(),
    myPendingWorkflowTaskCount(user.id, user.username),
  ]);
  return (
    <Shell user={user} title="Medical Director">
      <div className="grid g4 stack-2">
        <KpiTile label="Patients today" value={today0.checked_in} foot={`${today0.open} in the clinic · ${today0.booked} still booked`} />
        <KpiTile label="Billed today" value={<Money cents={today0.revenue} short />} foot={<>Collected <Money cents={today0.collected} decimals={0} /></>} />
        <KpiTile accent={false} label="Visits — 30 days" value={k.visits.toLocaleString('en-KE')} foot={`${k.new_patients} new patients · avg wait ${k.avg_wait != null ? Math.round(k.avg_wait) : '—'} min`}
          spark={monthly.map((m) => m.visits)} />
        <KpiTile accent={false} label="Billed — 30 days" value={<Money cents={k.revenue} short />} foot={`${Math.round(k.insured_share)}% to payers · avg bill ${formatMoney(k.avg_bill)}`}
          spark={monthly.map((m) => Number(m.billed))} sparkColor="var(--series-3)" />
      </div>
      <QueueTiles counts={counts} />
      <div className="grid g2">
        <Card><CardHead title="Billed vs collected — 12 months" />
          <MonthTrend months={monthly.map((m) => m.month)} series={[{ name: 'Billed', values: monthly.map((m) => Number(m.billed)) }, { name: 'Collected at cashier', values: monthly.map((m) => Number(m.collected)) }]} /></Card>
        <Card><CardHead title="Revenue mix — 30 days" />
          {cats.length ? <MixDonut rows={cats.map((c) => ({ name: c.category, amount: Number(c.amount) }))} total={cats.reduce((a, c) => a + Number(c.amount), 0)} /> : <EmptyState icon="💹" title="No bills yet" />}</Card>
      </div>
      <div className="grid g2">
        <Card><CardHead title="Top diagnoses — 30 days"><Link className="btn sm ghost" href="/clinic-reports/morbidity">MOH 705</Link></CardHead>
          {dx.length ? <MagnitudeBars money={false} rows={dx.map((d) => ({ label: `${d.icd_code ? `${d.icd_code} ` : ''}${d.description}`, value: d.total }))} /> : <EmptyState icon="🩺" title="No diagnoses" />}</Card>
        <Card><CardHead title="Who pays — 30 days" />
          {payers.length ? <MagnitudeBars rows={payers.map((p) => ({ label: p.payer, value: Number(p.amount), note: `${p.visits}` }))} /> : <EmptyState icon="🏥" title="No data" />}</Card>
      </div>
      <Toolbar>
        <span className="tiny muted-cell">{today0.lab_pending} lab tests in progress · {today0.rx_pending} prescriptions waiting · {today0.claims_draft} claims to submit · {approvals} approvals waiting on you</span>
        <Spacer /><Link className="btn ghost sm" href="/clinic-reports">Full performance report</Link>
      </Toolbar>
    </Shell>
  );
}

/* ------------------------------------------------------------------ Reception */

export async function ReceptionRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('PATIENTS_READ'))) return <Shell user={user} title="Reception"><LockedCard title="Front office" /></Shell>;
  const [g, counts, appts, hours] = await Promise.all([R.todayAtAGlance(), queueCounts(), listAppointments({ from: today(), to: today() }), R.arrivalsByHour()]);
  const waiting = appts.filter((a) => a.status === 'BOOKED' || a.status === 'CONFIRMED');
  return (
    <Shell user={user} title="Reception">
      <Toolbar>
        <Link className="btn" href="/patients">Find / register patient</Link>
        <Link className="btn ghost" href="/appointments">Appointments</Link>
        <Link className="btn ghost" href="/queue-display" target="_blank">Waiting-room display ↗</Link>
      </Toolbar>
      <div className="grid g4 stack-2">
        <KpiTile label="Checked in today" value={g.checked_in} foot={`${g.seen} completed`} />
        <KpiTile accent={false} label="In the clinic now" value={g.open} foot={`${g.waiting} waiting in queues`} />
        <KpiTile accent={false} label="Still to arrive" value={waiting.length} foot={`${appts.filter((a) => a.status === 'ARRIVED').length} arrived`} />
        <KpiTile accent={false} label="Collected today" value={<Money cents={g.collected} short />} />
      </div>
      <QueueTiles counts={counts} />
      <div className="grid g2">
        <Card><CardHead title="Expected today" sub="Check them in as they arrive" />
          {waiting.length ? <TableWrap><thead><tr><th>Time</th><th>Patient</th><th>Clinic</th><th /></tr></thead>
            <tbody>{waiting.map((a) => <tr key={a.no}><td>{a.start_time}</td><td><b>{a.patient_name}</b><div className="tiny muted-cell">{a.mrn} · {a.phone ?? ''}</div></td><td>{a.department_name}</td>
              <td><Link className="btn sm" href={`/patients/${a.mrn}?appt=${a.no}&dept=${a.department_code}`}>Check in</Link></td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="📅" title="No more bookings today" />}</Card>
        <Card><CardHead title="Arrivals by hour" />
          {hours.length ? <MagnitudeBars money={false} rows={hours.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.n }))} /> : <EmptyState icon="⏱" title="No arrivals yet" />}</Card>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ Clinician / Nurse / Dental */

export async function ClinicianRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('CONSULTATION_WORK'))) return <Shell user={user} title="Clinician"><LockedCard title="Consultation queue" /></Shell>;
  const [opd, mine, counts] = await Promise.all([listQueue('OPD'), listVisits('open'), queueCounts()]);
  const myOpen = mine.filter((v) => v.clinician_user_id === user.id);
  return (
    <Shell user={user} title="Clinician">
      <QueueTiles counts={counts.filter((c) => c.kind === 'CLINIC' || ['LAB', 'RAD'].includes(c.code))} />
      <div className="grid g2">
        <Card><CardHead title="General OPD queue"><Link className="btn sm ghost" href="/queue/OPD">Queue</Link></CardHead>
          <QueueTable code="OPD" rows={opd} open={(n) => `/visits/${n}/notes`} /></Card>
        <Card><CardHead title="My patients in the clinic" sub="Waiting on results, pharmacy or the cashier" />
          {myOpen.length ? <TableWrap><thead><tr><th>Patient</th><th>Stage</th><th>Since</th><th /></tr></thead>
            <tbody>{myOpen.map((v) => <tr key={v.no}><td><b>{v.patient_name}</b><div className="tiny muted-cell">{v.mrn}</div></td><td><Pill status={v.stage}>{humanise(v.stage)}</Pill></td>
              <td className="tiny">{Math.floor(v.waiting_mins / 60)}h {v.waiting_mins % 60}m</td><td><Link className="btn sm ghost" href={`/visits/${v.no}/results`}>Results</Link></td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="👩‍⚕️" title="None" />}</Card>
      </div>
    </Shell>
  );
}

export async function NurseRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('TRIAGE_RECORD'))) return <Shell user={user} title="Nursing"><LockedCard title="Triage" /></Shell>;
  const [triage, proc, counts] = await Promise.all([listQueue('TRIAGE'), listQueue('PROC'), queueCounts()]);
  return (
    <Shell user={user} title="Nursing & Triage">
      <QueueTiles counts={counts} />
      <div className="grid g2">
        <Card><CardHead title="Triage queue"><Link className="btn sm ghost" href="/queue/TRIAGE">Queue</Link></CardHead><QueueTable code="TRIAGE" rows={triage} open={(n) => `/visits/${n}/triage`} /></Card>
        <Card><CardHead title="Procedure room"><Link className="btn sm ghost" href="/procedures">Procedures</Link></CardHead><QueueTable code="PROC" rows={proc} open={() => '/procedures'} /></Card>
      </div>
    </Shell>
  );
}

export async function DentalRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('DENTAL_READ'))) return <Shell user={user} title="Dental"><LockedCard title="Dental clinic" /></Shell>;
  const [queue, day, plans] = await Promise.all([listQueue('DENTAL'), dentalDay(), listActivePlans()]);
  return (
    <Shell user={user} title="Dental Clinic">
      <div className="grid g3 stack-2">
        <KpiTile label="Dental patients today" value={day.filter((d) => d.source === 'VISIT').length} foot={`${day.filter((d) => d.source === 'APPOINTMENT').length} still booked`} />
        <KpiTile accent={false} label="Open treatment plans" value={plans.length} />
        <KpiTile accent={false} label="Planned work outstanding" value={<Money cents={plans.reduce((a, p) => a + Number(p.total ?? 0) - Number(p.completed_total ?? 0), 0)} short />} />
      </div>
      <div className="grid g2">
        <Card><CardHead title="Dental queue"><Link className="btn sm ghost" href="/dental">Dental clinic</Link></CardHead><QueueTable code="DENTAL" rows={queue} open={(n) => `/visits/${n}/dental`} /></Card>
        <Card><CardHead title="Plans in progress"><Link className="btn sm ghost" href="/dental/plans">All</Link></CardHead>
          {plans.length ? <TableWrap><thead><tr><th>Plan</th><th>Patient</th><th className="num">Done</th><th className="num">Remaining</th></tr></thead>
            <tbody>{plans.slice(0, 10).map((p) => <tr key={p.no}><td className="mono"><Link href={`/dental/plan/${p.no}`}>{p.no}</Link></td><td>{p.patient_name}</td><td className="num">{p.done}/{p.items}</td><td className="num">{formatMoney(Number(p.total ?? 0) - Number(p.completed_total ?? 0))}</td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="🦷" title="No open plans" />}</Card>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ Lab / Pharmacy */

export async function LabRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('LAB_READ'))) return <Shell user={user} title="Laboratory"><LockedCard title="Laboratory" /></Shell>;
  const [c, collect, verify, tat] = await Promise.all([labCounts(), labWorklist('collect'), labWorklist('verify'), R.labTurnaround(R.defaultRange())]);
  const within = tat.reduce((a, t) => a + t.within, 0); const n = tat.reduce((a, t) => a + t.n, 0);
  return (
    <Shell user={user} title="Laboratory">
      <div className="grid g4 stack-2">
        <KpiTile label="To collect" value={c.collect} /><KpiTile accent={false} label="Awaiting results" value={c.process} />
        <KpiTile accent={false} label="Awaiting verification" value={c.verify} foot={`${c.done} released today`} />
        <KpiTile accent={false} label="Within turnaround (30 d)" value={n ? `${Math.round((within / n) * 100)}%` : '—'} foot={`${c.overdue} overdue now`} />
      </div>
      <div className="grid g2">
        <Card><CardHead title="Specimens to collect"><Link className="btn sm ghost" href="/laboratory">Collection</Link></CardHead>
          {collect.length ? <TableWrap><thead><tr><th>Patient</th><th>Test</th><th>Priority</th></tr></thead><tbody>{collect.slice(0, 10).map((t) => <tr key={t.id}><td>{t.patient_name}<div className="tiny muted-cell">{t.mrn}</div></td><td>{t.test_name}</td><td>{t.priority}</td></tr>)}</tbody></TableWrap> : <EmptyState icon="🧪" title="Nothing to collect" />}</Card>
        <Card><CardHead title="To verify"><Link className="btn sm ghost" href="/laboratory/verify">Verification</Link></CardHead>
          {verify.length ? <TableWrap><thead><tr><th>Specimen</th><th>Test</th><th>Flags</th></tr></thead><tbody>{verify.slice(0, 10).map((t) => <tr key={t.id}><td className="mono">{t.specimen_no}</td><td>{t.test_name}</td><td>{t.critical ? <span className="flag HH">CRIT</span> : t.abnormal ? <span className="flag H">ABN</span> : ''}</td></tr>)}</tbody></TableWrap> : <EmptyState icon="✅" title="Nothing to verify" />}</Card>
      </div>
    </Shell>
  );
}

export async function PharmacyRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('PHARMACY_READ'))) return <Shell user={user} title="Pharmacy"><LockedCard title="Pharmacy" /></Shell>;
  const [pending, low] = await Promise.all([prescriptionQueue('pending'), lowStock()]);
  return (
    <Shell user={user} title="Pharmacy">
      <div className="grid g3 stack-2">
        <KpiTile label="Prescriptions waiting" value={pending.length} />
        <KpiTile accent={false} label="Drugs at reorder point" value={low.length} />
        <KpiTile accent={false} label="Out of stock" value={low.filter((l) => Number(l.stock) <= 0).length} />
      </div>
      <div className="grid g2">
        <Card><CardHead title="To dispense"><Link className="btn sm ghost" href="/pharmacy">All</Link></CardHead>
          {pending.length ? <TableWrap><thead><tr><th>Rx</th><th>Patient</th><th className="num">Lines</th><th /></tr></thead><tbody>{pending.slice(0, 10).map((r) => <tr key={r.id}><td className="mono">{r.no}</td><td>{r.patient_name}</td><td className="num">{r.lines}</td><td><Link className="btn sm" href={`/pharmacy/rx/${r.no}`}>Dispense</Link></td></tr>)}</tbody></TableWrap> : <EmptyState icon="💊" title="None waiting" />}</Card>
        <Card><CardHead title="Low stock"><Link className="btn sm ghost" href="/pharmacy/reorder">All</Link></CardHead>
          {low.length ? <MagnitudeBars money={false} rows={low.slice(0, 10).map((l) => ({ label: `${l.generic_name} ${l.strength ?? ''}`, value: Number(l.stock), note: `reorder at ${l.reorder_point}` }))} /> : <EmptyState icon="✅" title="Stock is healthy" />}</Card>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ Cashier / Claims */

export async function CashierRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('CASHIER_READ'))) return <Shell user={user} title="Cashier"><LockedCard title="Cashier" /></Shell>;
  const [queue, coll] = await Promise.all([cashierQueue('open'), collectionsSummary(today(), today())]);
  const mine = coll;
  const due = queue.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const myTotal = mine.byCashier.find((c) => c.received_by === user.username);
  return (
    <Shell user={user} title="Cashier">
      <div className="grid g4 stack-2">
        <KpiTile label="At the cashier" value={queue.filter((q) => q.stage === 'CASHIER').length} />
        <KpiTile accent={false} label="To collect (open visits)" value={<Money cents={due} short />} />
        <KpiTile accent={false} label="Collected today" value={<Money cents={coll.byMethod.reduce((a, m) => a + Number(m.amount), 0)} short />} />
        <KpiTile accent={false} label="My collections today" value={<Money cents={myTotal?.amount ?? 0} short />} foot={`${myTotal?.n ?? 0} receipt(s)`} />
      </div>
      <div className="grid g2">
        <Card><CardHead title="Waiting to pay"><Link className="btn sm ghost" href="/cashier">Cashier</Link></CardHead>
          {queue.length ? <TableWrap><thead><tr><th>Patient</th><th>Payer</th><th className="num">Owes</th><th /></tr></thead><tbody>{queue.filter((q) => q.balance > 0).slice(0, 10).map((q) => <tr key={q.visit_id}><td>{q.patient_name}<div className="tiny muted-cell">{q.visit_no}</div></td><td className="tiny">{q.scheme_name ?? 'Cash'}</td><td className="num">{formatMoney(q.balance)}</td><td><Link className="btn sm" href={`/visits/${q.visit_no}/billing`}>Collect</Link></td></tr>)}</tbody></TableWrap> : <EmptyState icon="💳" title="Nobody to collect from" />}</Card>
        <Card><CardHead title="Today by method" />
          {coll.byMethod.length ? <MagnitudeBars rows={coll.byMethod.map((m) => ({ label: m.method === 'MPESA' ? 'M-Pesa' : humanise(m.method), value: Number(m.amount), note: `${m.n}` }))} /> : <EmptyState icon="🧾" title="Nothing collected yet" />}</Card>
      </div>
    </Shell>
  );
}

export async function ClaimsRoleCentre({ user }: { user: SessionUser }) {
  if (!(await currentCanAction('CLAIMS_READ'))) return <Shell user={user} title="Claims"><LockedCard title="Claims" /></Shell>;
  const [byScheme, pre, perf] = await Promise.all([claimsByScheme(), listPreauths('REQUESTED'), R.claimPerformance({ from: `${today().slice(0, 4)}-01-01`, to: today() })]);
  const sum = (k: 'draft' | 'submitted' | 'approved_unpaid') => byScheme.reduce((a, r) => a + Number(r[k]), 0);
  const claimed = perf.reduce((a, p) => a + Number(p.claimed), 0); const rejected = perf.reduce((a, p) => a + Number(p.rejected), 0);
  return (
    <Shell user={user} title="Claims & Insurance">
      <div className="grid g4 stack-2">
        <KpiTile label="To submit" value={<Money cents={sum('draft')} short />} foot={`${byScheme.reduce((a, r) => a + r.overdue, 0)} past deadline`} />
        <KpiTile accent={false} label="Awaiting decision" value={<Money cents={sum('submitted')} short />} />
        <KpiTile accent={false} label="Approved, unpaid" value={<Money cents={sum('approved_unpaid')} short />} />
        <KpiTile accent={false} label="Rejection rate (YTD)" value={claimed ? `${Math.round((rejected / claimed) * 100)}%` : '—'} foot={`${pre.length} pre-auth(s) pending`} />
      </div>
      <Card><CardHead title="By payer"><Link className="btn sm ghost" href="/claims/payers">Detail</Link></CardHead>
        {byScheme.length ? <TableWrap><thead><tr><th>Payer</th><th className="num">To submit</th><th className="num">Awaiting decision</th><th className="num">Approved unpaid</th></tr></thead><tbody>{byScheme.map((r) => <tr key={r.scheme_id}><td>{r.scheme_name}</td><td className="num">{formatMoney(r.draft)}</td><td className="num">{formatMoney(r.submitted)}</td><td className="num">{formatMoney(r.approved_unpaid)}</td></tr>)}</tbody></TableWrap> : <EmptyState icon="🏥" title="No claims yet" />}</Card>
    </Shell>
  );
}
