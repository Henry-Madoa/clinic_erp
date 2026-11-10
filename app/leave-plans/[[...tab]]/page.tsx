import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction, currentCanAction } from '@/lib/session';
import { listLeavePlans, type PlanView } from '@/lib/leaveManagement';
import { listActiveEmployees } from '@/lib/employees';
import { Page } from '@/components/layout/page';
import { filterRows, parseFilters } from '@/lib/listFilters';
import { ListTools } from '@/components/ui/list-tools';
import { LEAVE_PLAN_FILTER_FIELDS } from '@/lib/listExports/hr';
import { Card, EmptyState, Pill, TableWrap, Tabs, Toolbar, Spacer, type TabDefinition } from '@/components/ui/primitives';
import { NewPlanButton, SubmitButton, CancelApprovalButton, DeleteButton } from '../plan-actions';

const TABS: TabDefinition[] = [
  { key: 'open', label: 'Open', tone: 'info' },
  { key: 'pending', label: 'Pending Approval', tone: 'warn' },
  { key: 'approved', label: 'Approved', tone: 'ok' },
];

export default async function LeavePlansPage({ params, searchParams }: {
  params: Promise<{ tab?: string[] }>;
  searchParams: Promise<{ filters?: string }>;
}) {
  const { filters: filtersRaw } = await searchParams;
  const user = await requireAction('LEAVE_PLANS_READ');
  const { tab: segments } = await params;
  const requested = segments?.[0];
  if (requested && !TABS.some((t) => t.key === requested)) notFound();
  const tab = (requested ?? 'open') as PlanView;

  const [allRows, canCreate, employees] = await Promise.all([
    listLeavePlans(tab), currentCanAction('LEAVE_PLANS_CREATE'), listActiveEmployees(),
  ]);
  const rows = filterRows(allRows, LEAVE_PLAN_FILTER_FIELDS, parseFilters(filtersRaw));

  return (
    <Page title="Leave Plans" crumb="Advance annual-leave scheduling" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => `/leave-plans/${k}`} />
      <Toolbar>
        <ListTools exportKey="leave-plans" fields={LEAVE_PLAN_FILTER_FIELDS} filters={filtersRaw} params={{ view: tab }} count={rows.length} />
        <Spacer />
        {canCreate ? <NewPlanButton employees={employees} /> : null}
      </Toolbar>

      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>No.</th><th>Employee</th><th>Status</th><th className="num" /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const isOwn = r.created_by === user.username;
                return (
                  <tr key={r.no}>
                    <td className="mono"><Link href={`/leave-plans/view/${r.no}`}>{r.no}</Link></td>
                    <td><b>{r.employee_first_name} {r.employee_last_name}</b><div className="tiny mono">{r.employee_no}</div></td>
                    <td><Pill status={r.status} /></td>
                    <td className="num">
                      {r.status === 'Open' && canCreate && isOwn ? <>
                        <DeleteButton no={r.no} />{' '}<SubmitButton no={r.no} />
                      </> : null}
                      {r.status === 'Pending Approval' && canCreate && isOwn ? <CancelApprovalButton no={r.no} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : <EmptyState icon="🗓" title="No leave plans here" />}
      </Card>
    </Page>
  );
}
