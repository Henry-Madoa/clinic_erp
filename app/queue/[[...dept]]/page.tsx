import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { listQueue, queueCounts } from '@/lib/clinic/visits';
import { formatDateTime } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Pill, Toolbar, Spacer } from '@/components/ui/primitives';
import { RunButton } from '@/components/ui/modal-form';
import { Acuity, ageSex } from '@/components/clinic/patient-banner';
import { callNextRequest, queueActionRequest } from '@/app/actions/clinic';

/** Where a queue's "open" button takes the person serving it. */
const WORK_LINK: Record<string, (visitNo: string) => string> = {
  TRIAGE: (n) => `/visits/${n}/triage`, LAB: () => '/laboratory', RAD: () => '/imaging', PHARM: () => '/pharmacy',
  CASH: (n) => `/visits/${n}/billing`, PROC: () => '/procedures', DENTAL: (n) => `/visits/${n}/dental`,
};

export default async function QueuePage({ params }: { params: Promise<{ dept?: string[] }> }) {
  const user = await requireAction('QUEUES_WORK');
  const { dept: seg } = await params;
  const counts = await queueCounts();
  const code = seg?.[0] ?? counts.find((c) => c.code === 'TRIAGE')?.code ?? counts[0]?.code;
  const dept = counts.find((c) => c.code === code);
  if (!dept) notFound();
  const rows = await listQueue(dept.code, true);
  const live = rows.filter((r) => r.status !== 'DONE' && r.status !== 'SKIPPED');
  const done = rows.filter((r) => r.status === 'DONE' || r.status === 'SKIPPED');
  const canWork = canAction(user, 'QUEUES_WORK');
  const workHref = (visitNo: string): string => (WORK_LINK[dept.code] ?? ((n: string) => `/visits/${n}/notes`))(visitNo);
  return (
    <Page title={`${dept.name} queue`} crumb="Emergencies and the sickest first, then by waiting time" user={user}>
      <div className="queue-tiles">
        {counts.map((c) => (
          <Link key={c.code} href={`/queue/${c.code}`} className={`queue-tile${c.code === dept.code ? ' active' : ''}`} style={{ ['--qc' as string]: c.colour }}>
            <div className="qt-name">{c.name}</div><div className="qt-num">{c.waiting}</div>
            <div className="qt-foot">waiting · {c.serving} in service</div>
          </Link>
        ))}
      </div>
      <Toolbar>
        <Link className="btn ghost sm" href="/queue-display" target="_blank">Open waiting-room display ↗</Link>
        <Spacer />
        {canWork && live.some((r) => r.status === 'WAITING') ? (
          <RunButton label="📣 Call next patient" action={callNextRequest.bind(null, dept.code)}
            successTitle="Next patient called" />
        ) : null}
      </Toolbar>
      <Card>
        {live.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>No.</th><th>Patient</th><th>Acuity</th><th>Payer</th><th>Waiting</th><th>Status</th><th /></tr></thead>
            <tbody>{live.map((r) => (
              <tr key={r.id} className={r.status === 'CALLED' ? 'q-called' : r.status === 'SERVING' ? 'q-serving' : ''}>
                <td><span className="queue-no">{r.queue_no}</span>{r.priority !== 'ROUTINE' ? <div><Pill tone="bad">{r.priority}</Pill></div> : null}</td>
                <td><Link href={`/visits/${r.visit_no}`}><b>{r.patient_name}</b></Link><div className="tiny muted-cell">{r.mrn} · {ageSex(r.age, r.sex)}{r.alerts ? <span className="danger-text"> · ⚠ {r.alerts}</span> : null}</div></td>
                <td><Acuity value={r.acuity} /></td>
                <td className="tiny">{r.scheme_name ?? 'Cash'}</td>
                <td className={r.waiting_mins > 60 ? 'wait-long' : ''}>{r.waiting_mins} min</td>
                <td><Pill status={r.status} /></td>
                <td>
                  {canWork ? (
                    <span className="inline" style={{ gap: 4 }}>
                      {r.status === 'WAITING' ? <RunButton label="Call" className="btn sm" action={queueActionRequest.bind(null, r.id, 'CALLED')} successTitle={`${r.queue_no} called`} /> : null}
                      {r.status === 'CALLED' ? <RunButton label="Start" className="btn sm" action={queueActionRequest.bind(null, r.id, 'SERVING')} successTitle="Serving" /> : null}
                      <Link className="btn sm ghost" href={workHref(r.visit_no)}>Open</Link>
                      {r.status !== 'WAITING' ? <RunButton label="Back to waiting" className="btn sm ghost" action={queueActionRequest.bind(null, r.id, 'WAITING')} successTitle="Returned to the queue" /> : null}
                      <RunButton label="Done" className="btn sm ghost" action={queueActionRequest.bind(null, r.id, 'DONE')} successTitle="Done" />
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon="✅" title="Nobody waiting" />}
      </Card>
      {done.length ? (
        <Card>
          <div className="tiny muted-cell" style={{ marginBottom: 6 }}>Served today</div>
          <div className="chip-row">{done.map((r) => <span key={r.id} className="info-chip" title={formatDateTime(r.completed_at)}>{r.queue_no} · {r.patient_name}</span>)}</div>
        </Card>
      ) : null}
    </Page>
  );
}
