import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction, currentCanAction } from '@/lib/session';
import {
  listCashTransfers, hasAnyCashTransfers, CASH_MANAGEMENT_FILTER_FIELDS, CASH_TRANSFER_TYPES,
  cashTransferTypeMeta, type CashManagementView,
} from '@/lib/cashManagement';
import { parseFilters } from '@/lib/listFilters';
import { parseSort } from '@/lib/listSort';
import { Page } from '@/components/layout/page';
import {
  Card, EmptyState, Pill, TableWrap, Tabs, Toolbar, Spacer, type TabDefinition,
} from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/filters';
import { DynamicFilterBar } from '@/components/ui/dynamic-filter';
import { ExportButton } from '@/components/ui/export-button';
import { SortLink } from '@/components/ui/sort-link';
import { Money } from '@/components/ui/money';
import { NewCashTransferButton, SubmitButton, CancelApprovalButton, PostButton } from '../cash-management-actions';

const TABS: TabDefinition[] = [
  { key: 'open', label: 'Open', tone: 'info' },
  { key: 'pending', label: 'Pending Approval', tone: 'warn' },
  { key: 'approved', label: 'Approved', tone: 'accent' },
  { key: 'posted', label: 'Posted', tone: 'ok' },
];

export default async function CashManagementPage({ params, searchParams }: {
  params: Promise<{ tab?: string[] }>;
  searchParams: Promise<{ q?: string; filters?: string; sort?: string }>;
}) {
  const user = await requireAction('CASH_MANAGEMENT_READ');
  const { tab: segments } = await params;
  const { q = '', filters: filtersRaw, sort: sortRaw } = await searchParams;
  const filters = parseFilters(filtersRaw);
  const sort = parseSort(sortRaw);

  const requested = segments?.[0];
  if (requested && !TABS.some((t) => t.key === requested)) notFound();
  const tab = (requested ?? 'open') as CashManagementView;

  const [docs, empty, canCreate, canPost] = await Promise.all([
    listCashTransfers({ view: tab, search: q, filters, sort }),
    hasAnyCashTransfers(tab).then((any) => !any),
    currentCanAction('CASH_MANAGEMENT_CREATE'),
    currentCanAction('CASH_MANAGEMENT_POST'),
  ]);

  return (
    <Page title="Branch Cash" crumb="Treasury &amp; till cash movements — receive, issue, return" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => `/branch-cash/${k}`} />
      <Toolbar>
        <SearchInput placeholder="Search document no., account or creator…" disabled={empty} />
        <DynamicFilterBar fields={CASH_MANAGEMENT_FILTER_FIELDS} disabled={empty} />
        <ExportButton href="/api/export/list/branch-cash" params={{ q, view: tab, filters: filtersRaw, sort: sortRaw }} disabled={!docs.length} />
        <Spacer />
        {canCreate ? <NewCashTransferButton /> : null}
      </Toolbar>

      <Card>
        {docs.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th><SortLink sortKey="no">No.</SortLink></th>
                <th><SortLink sortKey="document_type">Movement</SortLink></th>
                <th>From → To</th>
                <th className="num"><SortLink sortKey="amount">Amount</SortLink></th>
                <th><SortLink sortKey="status">Status</SortLink></th>
                <th className="num" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const isOwn = d.created_by === user.username;
                return (
                  <tr key={d.no}>
                    <td className="mono"><Link href={`/branch-cash/view/${d.no}?view=${tab}`}>{d.no}</Link></td>
                    <td>{cashTransferTypeMeta(d.document_type).label}</td>
                    <td>
                      <span className="mono">{d.source_code}</span> → <span className="mono">{d.destination_code}</span>
                      <div className="tiny muted-cell">{d.source_name} → {d.destination_name}</div>
                    </td>
                    <td className="num"><Money cents={d.amount} /></td>
                    <td><Pill status={d.status} /></td>
                    <td className="num">
                      <div className="inline" style={{ justifyContent: 'flex-end' }}>
                        {d.status === 'Open' && canCreate && isOwn ? <SubmitButton no={d.no} /> : null}
                        {d.status === 'Pending Approval' && canCreate && isOwn ? <CancelApprovalButton no={d.no} /> : null}
                        {d.status === 'Approved' && canPost ? <PostButton no={d.no} /> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState
            icon="🏧"
            title="No cash movements here"
            sub={CASH_TRANSFER_TYPES.map((d) => d.label).join(' · ')}
          />
        )}
      </Card>
    </Page>
  );
}
