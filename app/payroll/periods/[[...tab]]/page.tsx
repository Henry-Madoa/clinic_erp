import Link from 'next/link';
import { requireAction, currentCanAction } from '@/lib/session';
import { listPayrollPeriods } from '@/lib/payroll';
import { Page } from '@/components/layout/page';
import { filterRows, parseFilters } from '@/lib/listFilters';
import { ListTools } from '@/components/ui/list-tools';
import { PAYROLL_PERIOD_FILTER_FIELDS } from '@/lib/listExports/hr';
import { Card, EmptyState, Pill, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { NewPeriodButton } from '../period-actions';

export default async function PayrollPeriodsPage({ searchParams }: { searchParams: Promise<{ filters?: string }> }) {
  const { filters: filtersRaw } = await searchParams;
  const user = await requireAction('PAYROLL_PERIODS_READ');
  const [allRows, canCreate] = await Promise.all([listPayrollPeriods(), currentCanAction('PAYROLL_PERIODS_CREATE')]);
  const rows = filterRows(allRows, PAYROLL_PERIOD_FILTER_FIELDS, parseFilters(filtersRaw));
  const hasOpenOrPending = allRows.some((r) => r.status === 'OPEN' || r.status === 'PENDING_APPROVAL');

  return (
    <Page title="Payroll Periods" crumb="Run, approve and close payroll" user={user}>
      <Toolbar>
        <ListTools exportKey="payroll-periods" fields={PAYROLL_PERIOD_FILTER_FIELDS} filters={filtersRaw} params={{}} count={rows.length} />
        <Spacer />
        {canCreate && !hasOpenOrPending ? <NewPeriodButton /> : null}
      </Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>Period</th><th>Start</th><th>End</th><th>Status</th><th className="num" /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="mono"><Link href={`/payroll/periods/view/${p.id}`}>{p.period_name}</Link></td>
                  <td>{p.start_date}</td>
                  <td>{p.end_date}</td>
                  <td><Pill status={p.status.replace('_', ' ')} /></td>
                  <td className="num" />
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : <EmptyState icon="🗓" title="No payroll periods yet" />}
      </Card>
    </Page>
  );
}
