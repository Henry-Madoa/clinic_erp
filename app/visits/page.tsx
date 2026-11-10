import Link from 'next/link';
import { requireAction } from '@/lib/session';
import { listVisits, patientFlow, queueCounts, VISIT_STAGES } from '@/lib/clinic/visits';
import { formatDateTime, formatMoney, humanise } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Pill, TableWrap, Tabs, Toolbar } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/filters';
import { Acuity, ageSex } from '@/components/clinic/patient-banner';

const VIEWS = [{ key: 'flow', label: 'Patient flow' }, { key: 'open', label: 'Open visits' }, { key: 'today', label: 'Today' }, { key: 'closed', label: 'Closed (30 days)' }];
const waitText = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const user = await requireAction('VISITS_READ');
  const { view = 'flow', q = '' } = await searchParams;
  return (
    <Page title="Patient Flow" crumb="Every patient in the clinic and where they are in their visit" user={user}>
      <Tabs tabs={VIEWS} active={view} hrefFor={(k) => (k === 'flow' ? '/visits' : `/visits?view=${k}`)} />
      {view === 'flow' ? <Flow /> : <VisitList view={view as 'open' | 'today' | 'closed'} q={q} />}
    </Page>
  );
}

async function Flow() {
  const [flow, counts] = await Promise.all([patientFlow(), queueCounts()]);
  return (
    <>
      <div className="queue-tiles">
        {counts.map((c) => (
          <Link key={c.code} href={`/queue/${c.code}`} className="queue-tile" style={{ ['--qc' as string]: c.colour }}>
            <div className="qt-name">{c.name}</div>
            <div className="qt-num">{c.waiting}</div>
            <div className="qt-foot">waiting · {c.serving} being served{c.longest_mins ? ` · longest ${waitText(c.longest_mins)}` : ''}</div>
          </Link>
        ))}
      </div>
      <div className="flow-board">
        {VISIT_STAGES.filter((s) => s !== 'COMPLETED').concat([]).map((s) => (
          <div key={s} className="flow-col">
            <h4><span>{humanise(s)}</span><span>{flow[s]?.length ?? 0}</span></h4>
            {(flow[s] ?? []).map((v) => (
              <Link key={v.no} href={`/visits/${v.no}`} className="flow-card" style={{ ['--fc' as string]: v.department_colour }}>
                <div className="fc-name">{v.patient_name}</div>
                <div className="fc-meta"><span>{ageSex(v.age, v.sex)} · {v.department_name}</span><Acuity value={v.acuity} /></div>
                <div className="fc-meta"><span className="mono">{v.queue_no ?? v.no}</span><span className={v.waiting_mins > 90 ? 'wait-long' : ''}>⏱ {waitText(v.waiting_mins)}</span></div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

async function VisitList({ view, q }: { view: 'open' | 'today' | 'closed'; q: string }) {
  const rows = await listVisits(view, q);
  return (
    <>
      <Toolbar><SearchInput placeholder="Visit, MRN or name…" /></Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>Visit</th><th>Patient</th><th>Clinic</th><th>Checked in</th><th>Acuity</th><th>Payer</th><th>Stage</th><th className="num">Charges</th><th className="num">Paid</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.no}>
                <td className="mono"><Link href={`/visits/${v.no}`}>{v.no}</Link><div className="tiny muted-cell">{humanise(v.visit_type)}</div></td>
                <td><b>{v.patient_name}</b><div className="tiny muted-cell">{v.mrn} · {ageSex(v.age, v.sex)}</div></td>
                <td>{v.department_name}<div className="tiny muted-cell">{v.clinician_name ?? ''}</div></td>
                <td className="tiny">{formatDateTime(v.check_in_at)}</td><td><Acuity value={v.acuity} /></td>
                <td className="tiny">{v.scheme_name ?? 'Cash'}</td>
                <td><Pill status={v.status === 'OPEN' ? v.stage : v.status}>{humanise(v.status === 'OPEN' ? v.stage : v.status)}</Pill></td>
                <td className="num">{formatMoney(v.charges_total)}</td><td className="num">{formatMoney(v.paid_total)}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="📋" title="No visits" />}
      </Card>
    </>
  );
}
