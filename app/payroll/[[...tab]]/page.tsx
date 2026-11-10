import Link from 'next/link';
import { requireAction, currentCanAction } from '@/lib/session';
import { getDimensionCaptions } from '@/lib/org';
import { Page } from '@/components/layout/page';
import { filterRows, parseFilters } from '@/lib/listFilters';
import { ListTools } from '@/components/ui/list-tools';
import { PAYROLL_RUN_FILTER_FIELDS, payrollRunRows } from '@/lib/listExports/misc';
import { Card, CardHead, EmptyState, Pill, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money';
import { RunForPeriodButton } from '../payroll-actions';

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ filters?: string }> }) {
  const user = await requireAction('PAYROLL_READ');
  const { filters } = await searchParams;
  const [{ period, rows }, canRun, { caption2 }] = await Promise.all([
    payrollRunRows(), currentCanAction('PAYROLL_PERIODS_RUN'), getDimensionCaptions(),
  ]);
  const employees = filterRows(rows, PAYROLL_RUN_FILTER_FIELDS, parseFilters(filters));

  return (
    <Page title="Payroll" crumb={period ? `Open period: ${period.period_name}` : 'No open payroll period'} user={user}>
      {!period ? (
        <Card>
          <EmptyState icon="💰" title="No open payroll period"
            sub={<>Start one under <Link href="/payroll/periods">Payroll Periods</Link> before running payroll.</>} />
        </Card>
      ) : (
        <>
          <Toolbar>
            <ListTools exportKey="payroll-run" fields={PAYROLL_RUN_FILTER_FIELDS} filters={filters} count={employees.length} />
            <Spacer />
            {canRun ? <RunForPeriodButton periodId={period.id} /> : null}
          </Toolbar>
          <Card>
            <CardHead title={`Employees — ${period.period_name}`} sub="Every Active / On Leave employee with a payroll posting group" />
            {employees.length ? (
              <TableWrap>
                <thead><tr><th>Employee No.</th><th>Name</th><th>{caption2}</th><th className="num">Net pay (this run)</th></tr></thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td className="mono"><Link href={`/payroll/view/${e.id}`}>{e.employee_no}</Link></td>
                      <td><b>{e.first_name} {e.last_name}</b></td>
                      <td>{e.global_dimension_2_name || '—'}</td>
                      <td className="num">{e.net_pay != null ? <Money cents={e.net_pay} /> : <Pill tone="warn">Not run</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : <EmptyState icon="🧑‍💼" title="No active employees with a posting group set" />}
          </Card>
        </>
      )}
    </Page>
  );
}
