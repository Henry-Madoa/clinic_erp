import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { dentalDay, listActivePlans, getPlan, listPlanItems } from '@/lib/clinic/dental';
import { getPatientById } from '@/lib/clinic/patients';
import { listQueue } from '@/lib/clinic/visits';
import { formatDate, formatMoney, humanise } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { RunButton } from '@/components/ui/modal-form';
import { PatientBanner } from '@/components/clinic/patient-banner';
import { planStatusRequest, cancelPlanItemRequest } from '@/app/actions/clinic';

const TABS = [{ key: 'today', label: 'Today' }, { key: 'plans', label: 'Treatment plans' }];

export default async function DentalPage({ params }: { params: Promise<{ tab?: string[] }> }) {
  const user = await requireAction('DENTAL_READ');
  const seg = (await params).tab;
  if (seg?.[0] === 'plan' && seg[1]) return <PlanCard no={decodeURIComponent(seg[1])} />;
  const tab = seg?.[0] ?? 'today';
  if (!TABS.some((t) => t.key === tab)) notFound();
  if (tab === 'plans') {
    const plans = await listActivePlans();
    return (
      <Page title="Dental — Treatment Plans" crumb="Proposed and accepted plans not yet complete" user={user}>
        <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'today' ? '/dental' : `/dental/${k}`)} />
        <Card>
          {plans.length ? <TableWrap><thead><tr><th>Plan</th><th>Patient</th><th>Title</th><th>Status</th><th className="num">Progress</th><th className="num">Quoted</th><th className="num">Done</th><th>Since</th></tr></thead>
            <tbody>{plans.map((p) => <tr key={p.no}><td className="mono"><Link href={`/dental/plan/${p.no}`}>{p.no}</Link></td><td><Link href={`/patients/${p.mrn}?tab=dental`}>{p.patient_name}</Link><div className="tiny muted-cell">{p.mrn}</div></td>
              <td>{p.title}</td><td><Pill status={p.status} /></td><td className="num">{p.done}/{p.items}</td><td className="num">{formatMoney(p.total)}</td><td className="num">{formatMoney(p.completed_total)}</td><td className="tiny">{formatDate(p.created_at)}</td></tr>)}</tbody></TableWrap>
            : <EmptyState icon="🦷" title="No open plans" />}
        </Card>
      </Page>
    );
  }
  const [day, queue, plans] = await Promise.all([dentalDay(), listQueue('DENTAL'), listActivePlans()]);
  const pipeline = plans.reduce((a, p) => a + Number(p.total ?? 0) - Number(p.completed_total ?? 0), 0);
  return (
    <Page title="Dental Clinic" crumb="Today’s chairs, the queue and the treatment pipeline" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'today' ? '/dental' : `/dental/${k}`)} />
      <div className="grid g4 stack-2">
        <Stat label="Patients today" value={day.filter((d) => d.source === 'VISIT').length} />
        <Stat accent={false} label="Still booked today" value={day.filter((d) => d.source === 'APPOINTMENT').length} />
        <Stat accent={false} label="Waiting in the queue" value={queue.filter((q) => q.status === 'WAITING').length} />
        <Stat accent={false} label="Planned work not yet done" value={formatMoney(pipeline)} foot={`${plans.length} open plan(s)`} />
      </div>
      <Toolbar><Link className="btn" href="/queue/DENTAL">Dental queue</Link><Spacer /><Link className="btn ghost" href="/appointments?dept=DENTAL">Dental appointments</Link></Toolbar>
      <Card>
        <CardHead title="Today" />
        {day.length ? <TableWrap><thead><tr><th>Time</th><th>Patient</th><th>Status</th><th>Plan</th><th /></tr></thead>
          <tbody>{day.map((d, i) => <tr key={i}><td>{d.time ?? '—'}</td><td><b>{d.patient_name}</b><div className="tiny muted-cell">{d.mrn}</div></td>
            <td>{d.source === 'APPOINTMENT' ? <Pill tone="info">Booked</Pill> : <Pill status={d.status}>{humanise(d.status)}</Pill>}</td>
            <td className="mono">{d.plan_no ? <Link href={`/dental/plan/${d.plan_no}`}>{d.plan_no}</Link> : '—'}</td>
            <td>{d.visit_no ? <Link className="btn sm" href={`/visits/${d.visit_no}/dental`}>Open chart</Link> : <Link className="btn sm ghost" href={`/patients/${d.mrn}?checkin=1&dept=DENTAL`}>Check in</Link>}</td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="🦷" title="No dental patients today" />}
      </Card>
    </Page>
  );
}

async function PlanCard({ no }: { no: string }) {
  const user = await requireAction('DENTAL_READ');
  const plan = await getPlan(no);
  if (!plan) notFound();
  const [items, patient] = await Promise.all([listPlanItems(plan.id), getPatientById(plan.patient_id)]);
  const canWork = canAction(user, 'DENTAL_WORK');
  const path = `/dental/plan/${no}`;
  return (
    <Page title={`${plan.no} — ${plan.title}`} crumb={`Treatment plan · created ${formatDate(plan.created_at)} by ${plan.created_by}`} user={user}>
      {patient ? <PatientBanner p={patient} right={<Pill status={plan.status} />} /> : null}
      <Toolbar>
        <Link className="btn ghost sm" href="/dental/plans">← Plans</Link>
        <Link className="btn ghost sm" target="_blank" href={`/clinic-print/dental-plan/${plan.no}`}>Print quotation</Link>
        <Spacer />
        {canWork && plan.status === 'PROPOSED' ? <RunButton label="Patient accepts" action={planStatusRequest.bind(null, plan.no, 'ACCEPTED', path)} successTitle="Plan accepted" /> : null}
        {canWork && !['COMPLETED', 'CANCELLED'].includes(plan.status) ? <RunButton label="Cancel plan" className="btn ghost danger" action={planStatusRequest.bind(null, plan.no, 'CANCELLED', path)} successTitle="Plan cancelled" confirm={{ title: 'Cancel the plan?', message: 'Remaining items will not be done.', danger: true }} /> : null}
      </Toolbar>
      <div className="grid g3 stack-2">
        <Stat label="Quoted" value={formatMoney(plan.total ?? 0)} />
        <Stat accent={false} label="Done & charged" value={formatMoney(plan.completed_total ?? 0)} foot={`${plan.done}/${plan.items} items`} />
        <Stat accent={false} label="Remaining" value={formatMoney(Number(plan.total ?? 0) - Number(plan.completed_total ?? 0))} />
      </div>
      <Card>
        <CardHead title="Procedures" sub="Items are completed (and charged) from the patient’s dental visit" />
        <TableWrap><thead><tr><th>Phase</th><th>Tooth</th><th>Code</th><th>Procedure</th><th className="num">Fee</th><th>Status</th><th>Done</th><th /></tr></thead>
          <tbody>{items.map((i) => <tr key={i.id}><td>{i.phase}</td><td className="mono">{i.tooth ?? '—'}{i.surfaces ? ` ${i.surfaces}` : ''}</td><td className="mono tiny">{i.service_code}</td><td>{i.description}<div className="tiny muted-cell">{i.notes ?? ''}</div></td>
            <td className="num">{formatMoney(i.fee)}</td><td><Pill status={i.status} /></td><td className="tiny">{i.completed_at ? `${formatDate(i.completed_at)} · ${i.completed_by}` : ''}</td>
            <td>{canWork && i.status === 'PLANNED' ? <RunButton label="Drop" className="btn sm ghost" action={cancelPlanItemRequest.bind(null, i.id, path)} successTitle="Item dropped" /> : null}</td></tr>)}</tbody></TableWrap>
      </Card>
    </Page>
  );
}
