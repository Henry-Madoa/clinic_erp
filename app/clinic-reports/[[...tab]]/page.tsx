import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import * as R from '@/lib/clinic/reports';
import { formatDate, formatMoney, humanise } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, EmptyState, Stat, TableWrap, Tabs, Toolbar } from '@/components/ui/primitives';
import { DateFilterInput } from '@/components/ui/filters';
import { Trend } from '@/components/charts/trend';
import { HBars } from '@/components/charts/hbars';
import { Donut } from '@/components/charts/donut';
import { GroupedBars } from '@/components/charts/grouped-bars';

const TABS = [{ key: 'overview', label: 'Overview' }, { key: 'morbidity', label: 'Morbidity (MOH 705)' }, { key: 'revenue', label: 'Revenue & payers' }, { key: 'services', label: 'Lab, dental & pharmacy' }];
const PALETTE = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4, #8b5cf6)', 'var(--series-5, #f59e0b)', 'var(--series-6, #64748b)'];

export default async function ClinicReports({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireAction('CLINIC_REPORTS_VIEW');
  const tab = (await params).tab?.[0] ?? 'overview';
  if (!TABS.some((t) => t.key === tab)) notFound();
  const sp = await searchParams;
  const def = R.defaultRange();
  const range = { from: sp.from || def.from, to: sp.to || def.to };
  return (
    <Page title="Clinic Performance" crumb={`${formatDate(range.from)} – ${formatDate(range.to)}`} user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => `/clinic-reports${k === 'overview' ? '' : `/${k}`}${sp.from || sp.to ? `?from=${range.from}&to=${range.to}` : ''}`} />
      <Toolbar><DateFilterInput paramName="from" label="From" /><DateFilterInput paramName="to" label="To" /></Toolbar>
      {tab === 'overview' ? <Overview r={range} /> : tab === 'morbidity' ? <Morbidity r={range} /> : tab === 'revenue' ? <Revenue r={range} /> : <Services r={range} />}
    </Page>
  );
}

async function Overview({ r }: { r: R.DateRange }) {
  const [k, census, depts, ageSex, clinicians] = await Promise.all([R.clinicKpis(r), R.dailyCensus(r), R.visitsByDepartment(r), R.ageSexProfile(r), R.clinicianActivity(r)]);
  const days = [...new Set(census.map((c) => c.day))];
  const deptNames = [...new Set(census.map((c) => c.department))].slice(0, 3);
  return (
    <>
      <div className="grid g4 stack-2">
        <Stat label="Visits" value={k.visits.toLocaleString('en-KE')} foot={`${k.patients} patients · ${k.new_patients} new`} />
        <Stat label="Billed" value={formatMoney(k.revenue)} foot={`avg ${formatMoney(k.avg_bill)} per bill`} />
        <Stat accent={false} label="Collected at the cashier" value={formatMoney(k.collected)} foot={`${Math.round(k.insured_share)}% of billing is to payers`} />
        <Stat accent={false} label="Average wait to be called" value={k.avg_wait != null ? `${Math.round(k.avg_wait)} min` : '—'} foot={`${k.lab_tests} lab tests · ${k.rx} Rx · ${k.dental} dental procedures`} />
      </div>
      <Card>
        <CardHead title="Daily attendance" sub="Top clinics" />
        {days.length ? <Trend money={false} labels={days.map((d) => d.slice(5))} series={deptNames.map((n, i) => ({ name: n, color: PALETTE[i], values: days.map((d) => census.find((c) => c.day === d && c.department === n)?.n ?? 0) }))} />
          : <EmptyState icon="📈" title="No visits in this period" />}
      </Card>
      <div className="grid g2">
        <Card><CardHead title="By clinic" />
          <TableWrap><thead><tr><th>Clinic</th><th className="num">Visits</th><th className="num">New</th><th className="num">Billed</th></tr></thead>
            <tbody>{depts.map((d) => <tr key={d.department}><td><span style={{ borderLeft: `4px solid ${d.colour}`, paddingLeft: 6 }}>{d.department}</span></td><td className="num">{d.visits}</td><td className="num">{d.new_visits}</td><td className="num">{formatMoney(d.revenue)}</td></tr>)}</tbody></TableWrap></Card>
        <Card><CardHead title="Age & sex" />
          {ageSex.length ? <GroupedBars money={false} labels={ageSex.map((a) => a.band)} series={[{ name: 'Female', color: 'var(--series-2)', values: ageSex.map((a) => a.female) }, { name: 'Male', color: 'var(--series-1)', values: ageSex.map((a) => a.male) }]} /> : <EmptyState icon="👥" title="No data" />}</Card>
      </div>
      <Card><CardHead title="Clinicians" />
        {clinicians.length ? <TableWrap><thead><tr><th>Clinician</th><th className="num">Visits</th><th className="num">Diagnoses</th><th className="num">Billed</th></tr></thead>
          <tbody>{clinicians.map((c) => <tr key={c.clinician}><td>{c.clinician}</td><td className="num">{c.visits}</td><td className="num">{c.diagnoses}</td><td className="num">{formatMoney(c.revenue)}</td></tr>)}</tbody></TableWrap> : <EmptyState icon="👩‍⚕️" title="No data" />}</Card>
    </>
  );
}

async function Morbidity({ r }: { r: R.DateRange }) {
  const rows = await R.topDiagnoses(r, 30);
  return (
    <Card>
      <CardHead title="Top diagnoses" sub="Under-5 (MOH 705A) and 5 & over (MOH 705B) — provisional diagnoses excluded" />
      {rows.length ? <TableWrap><thead><tr><th>ICD-10</th><th>Diagnosis</th><th className="num">Under 5</th><th className="num">5 & over</th><th className="num">Female</th><th className="num">Male</th><th className="num">Total</th></tr></thead>
        <tbody>{rows.map((d, i) => <tr key={i}><td className="mono">{d.icd_code ?? '—'}</td><td>{d.description}</td><td className="num">{d.under5}</td><td className="num">{d.over5}</td><td className="num">{d.female}</td><td className="num">{d.male}</td><td className="num"><b>{d.total}</b></td></tr>)}</tbody></TableWrap>
        : <EmptyState icon="🩺" title="No diagnoses in this period" />}
    </Card>
  );
}

async function Revenue({ r }: { r: R.DateRange }) {
  const [cats, payers, methods, monthly, claims] = await Promise.all([R.revenueByCategory(r), R.revenueByPayer(r), R.collectionsByMethod(r), R.monthlyRevenue(12), R.claimPerformance(r)]);
  return (
    <>
      <Card><CardHead title="Billed vs collected — 12 months" sub="Collections exclude what payers settle through Receivables" />
        <GroupedBars labels={monthly.map((m) => m.month.slice(2))} series={[{ name: 'Billed', color: 'var(--series-1)', values: monthly.map((m) => Number(m.billed)) }, { name: 'Collected at cashier', color: 'var(--series-3)', values: monthly.map((m) => Number(m.collected)) }]} /></Card>
      <div className="grid g3">
        <Card><CardHead title="By service category" />{cats.length ? <HBars rows={cats.map((c) => ({ label: c.category, value: Number(c.amount) }))} /> : <EmptyState icon="💹" title="No data" />}</Card>
        <Card><CardHead title="Who pays" />{payers.length ? <Donut segments={payers.slice(0, 6).map((p, i) => ({ label: p.payer, value: Number(p.amount), color: PALETTE[i] }))} /> : <EmptyState icon="🏥" title="No data" />}</Card>
        <Card><CardHead title="Collections by method" />{methods.length ? <HBars rows={methods.map((m) => ({ label: m.method === 'MPESA' ? 'M-Pesa' : humanise(m.method), value: Number(m.amount), note: `${m.n}` }))} /> : <EmptyState icon="💳" title="No data" />}</Card>
      </div>
      <Card><CardHead title="Claims by payer" />
        {claims.length ? <TableWrap><thead><tr><th>Payer</th><th className="num">Claims</th><th className="num">Claimed</th><th className="num">Approved</th><th className="num">Rejected</th><th className="num">Rejection %</th><th className="num">Pending</th><th className="num">Avg days to decide</th></tr></thead>
          <tbody>{claims.map((c) => <tr key={c.scheme}><td>{c.scheme}</td><td className="num">{c.claims}</td><td className="num">{formatMoney(c.claimed)}</td><td className="num">{formatMoney(c.approved)}</td><td className="num">{formatMoney(c.rejected)}</td>
            <td className="num">{c.claimed ? `${Math.round((Number(c.rejected) / Number(c.claimed)) * 100)}%` : '—'}</td><td className="num">{formatMoney(c.pending)}</td><td className="num">{c.avg_days != null ? c.avg_days.toFixed(1) : '—'}</td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="🏥" title="No claims" />}</Card>
    </>
  );
}

async function Services({ r }: { r: R.DateRange }) {
  const [tat, dental] = await Promise.all([R.labTurnaround(r), R.dentalProcedures(r)]);
  return (
    <>
      <Card><CardHead title="Laboratory turnaround" sub="Request to verified release, against each test’s target" />
        {tat.length ? <TableWrap><thead><tr><th>Test</th><th>Section</th><th className="num">Tests</th><th className="num">Avg (min)</th><th className="num">Target</th><th className="num">Within target</th></tr></thead>
          <tbody>{tat.map((t) => <tr key={t.test}><td>{t.test}</td><td className="tiny">{humanise(t.section)}</td><td className="num">{t.n}</td><td className={`num ${t.avg_mins > t.target ? 'danger-text' : ''}`}>{t.avg_mins}</td><td className="num">{t.target}</td><td className="num">{t.n ? `${Math.round((t.within / t.n) * 100)}%` : '—'}</td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="🧪" title="No released tests" />}</Card>
      <Card><CardHead title="Dental procedures done" />
        {dental.length ? <TableWrap><thead><tr><th>Procedure</th><th className="num">Done</th><th className="num">Value</th></tr></thead>
          <tbody>{dental.map((d) => <tr key={d.procedure}><td>{d.procedure}</td><td className="num">{d.n}</td><td className="num">{formatMoney(d.amount)}</td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="🦷" title="None" />}</Card>
    </>
  );
}
