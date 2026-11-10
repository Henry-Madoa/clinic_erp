import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { cashierQueue, listReceipts, collectionsSummary } from '@/lib/clinic/billing';
import { formatDate, formatMoney, humanise, today } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput, DateFilterInput, SelectFilter } from '@/components/ui/filters';
import { HBars } from '@/components/charts/hbars';

const TABS = [{ key: 'queue', label: 'In clinic now' }, { key: 'unpaid', label: 'Unpaid final bills' }, { key: 'recent', label: 'Last 30 days' }, { key: 'receipts', label: 'Receipts & collections' }];

export default async function CashierPage({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ q?: string; from?: string; to?: string; method?: string }> }) {
  const user = await requireAction('CASHIER_READ');
  const tab = (await params).tab?.[0] ?? 'queue';
  const sp = await searchParams;
  if (!TABS.some((t) => t.key === tab)) notFound();
  return (
    <Page title="Cashier" crumb="Collect the patient’s share, finalise bills — insurance shares become claims" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'queue' ? '/cashier' : `/cashier/${k}`)} />
      {tab === 'receipts' ? <Receipts from={sp.from || today()} to={sp.to || today()} q={sp.q ?? ''} method={sp.method ?? ''} /> : <Queue view={tab === 'queue' ? 'open' : tab === 'unpaid' ? 'unpaid' : 'all'} q={sp.q ?? ''} />}
    </Page>
  );
}

async function Queue({ view, q }: { view: 'open' | 'unpaid' | 'all'; q: string }) {
  const rows = await cashierQueue(view, q);
  const due = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
  return (
    <>
      <div className="grid g3 stack-2">
        <Stat label="Visits" value={rows.length} />
        <Stat accent={false} label="To collect" value={formatMoney(due)} />
        <Stat accent={false} label="At the cashier now" value={rows.filter((r) => r.stage === 'CASHIER' && r.status === 'OPEN').length} />
      </div>
      <Toolbar><SearchInput placeholder="Visit, MRN or name…" /></Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>Visit</th><th>Patient</th><th>Payer</th><th>Stage</th><th className="num">Charges</th><th className="num">Paid</th><th className="num">Patient owes</th><th>Bill</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.visit_id} className={r.stage === 'CASHIER' && r.status === 'OPEN' ? 'q-serving' : ''}>
                <td className="mono">{r.visit_no}<div className="tiny muted-cell">{formatDate(r.visit_date)}</div></td>
                <td><b>{r.patient_name}</b><div className="tiny muted-cell">{r.mrn}</div></td>
                <td className="tiny">{r.scheme_name ?? 'Cash'}</td>
                <td><Pill status={r.status === 'OPEN' ? r.stage : r.status}>{humanise(r.status === 'OPEN' ? r.stage : r.status)}</Pill></td>
                <td className="num">{formatMoney(r.gross)}</td><td className="num">{formatMoney(r.paid)}</td>
                <td className={`num ${r.balance > 0 ? 'danger-text' : ''}`}><b>{formatMoney(r.balance)}</b></td>
                <td className="mono tiny">{r.bill_no ? `${r.bill_no} · ${humanise(r.bill_status)}` : 'open'}</td>
                <td><Link className="btn sm" href={`/visits/${r.visit_no}/billing`}>{r.balance > 0 ? 'Collect' : 'Open'}</Link></td>
              </tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="💳" title="Nothing to collect" />}
      </Card>
    </>
  );
}

async function Receipts({ from, to, q, method }: { from: string; to: string; q: string; method: string }) {
  const [rows, summary] = await Promise.all([listReceipts(from, to, q, method), collectionsSummary(from, to)]);
  const total = summary.byMethod.reduce((a, m) => a + Number(m.amount), 0);
  return (
    <>
      <Toolbar>
        <DateFilterInput paramName="from" label="From" /><DateFilterInput paramName="to" label="To" />
        <SelectFilter paramName="method" label="Method" options={['CASH', 'MPESA', 'CARD', 'BANK'].map((m) => ({ value: m, label: m === 'MPESA' ? 'M-Pesa' : humanise(m) }))} />
        <SearchInput placeholder="Receipt, MRN, code…" />
        <Spacer /><Link className="btn ghost sm" href="/till-closings">Close my shift</Link>
      </Toolbar>
      <div className="grid g3 stack-2">
        <Stat label={`Collected ${from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}`} value={formatMoney(total)} foot={`${rows.filter((r) => r.status === 'POSTED').length} receipt(s)`} />
        <Card><CardHead title="By method" /><HBars rows={summary.byMethod.map((m) => ({ label: m.method === 'MPESA' ? 'M-Pesa' : humanise(m.method), value: Number(m.amount), note: `${m.n}` }))} /></Card>
        <Card><CardHead title="By cashier" sub={summary.voided.n ? `${summary.voided.n} voided (${formatMoney(summary.voided.amount)})` : undefined} />
          <HBars rows={summary.byCashier.map((c) => ({ label: c.received_by, value: Number(c.amount), note: `${c.n}` }))} /></Card>
      </div>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>Receipt</th><th>Date</th><th>Patient</th><th>Visit</th><th>Method</th><th>Reference</th><th>Account</th><th className="num">Amount</th><th>By</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="mono">{r.no}</td><td>{formatDate(r.payment_date)}</td><td>{r.patient_name}<div className="tiny muted-cell">{r.mrn}</div></td>
                <td className="mono">{r.visit_no ? <Link href={`/visits/${r.visit_no}/billing`}>{r.visit_no}</Link> : '—'}</td><td>{r.method === 'MPESA' ? 'M-Pesa' : humanise(r.method)}</td>
                <td className="mono tiny">{r.reference ?? '—'}</td><td className="tiny">{r.bank_account_name}</td><td className="num">{formatMoney(r.amount)}</td><td className="tiny">{r.received_by}</td>
                <td><Pill status={r.status} /></td><td><Link className="btn sm ghost" target="_blank" href={`/clinic-print/receipt/${r.no}`}>Print</Link></td></tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="🧾" title="No receipts in this period" />}
      </Card>
    </>
  );
}
