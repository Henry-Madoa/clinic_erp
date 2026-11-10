import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction, currentCanAction } from '@/lib/session';
import {
  listTillClosings, hasAnyTillClosings, TILL_CLOSING_FILTER_FIELDS, closableTillsForUser, listTreasuryAccounts, tillStatusBoard, type TillClosingListView,
} from '@/lib/tillClosings';
import { treasurySetupForUser } from '@/lib/cashierSetup';
import { parseFilters } from '@/lib/listFilters';
import { parseSort } from '@/lib/listSort';
import { formatDate, today } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Pill, TableWrap, Tabs, Toolbar, Spacer, type TabDefinition } from '@/components/ui/primitives';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { SearchInput } from '@/components/ui/filters';
import { DynamicFilterBar } from '@/components/ui/dynamic-filter';
import { ExportButton } from '@/components/ui/export-button';
import { SortLink } from '@/components/ui/sort-link';
import { Money } from '@/components/ui/money';
import { NewClosingButton, SubmitButton, CancelApprovalButton, PostButton } from '../till-closing-actions';

const TABS: TabDefinition[] = [
  { key: 'open', label: 'Open', tone: 'info' },
  { key: 'pending', label: 'Pending Approval', tone: 'warn' },
  { key: 'approved', label: 'Approved', tone: 'accent' },
  { key: 'posted', label: 'Posted', tone: 'ok' },
];

export default async function TillClosingsPage({ params, searchParams }: {
  params: Promise<{ tab?: string[] }>;
  searchParams: Promise<{ q?: string; filters?: string; sort?: string }>;
}) {
  const user = await requireAction('TILL_CLOSINGS_READ');
  const { tab: segments } = await params;
  const { q = '', filters: filtersRaw, sort: sortRaw } = await searchParams;
  const requested = segments?.[0];
  if (requested && !TABS.some((t) => t.key === requested)) notFound();
  const tab = (requested ?? 'open') as TillClosingListView;
  const [rows, empty, canCreate, canPost, tills, treasuries, isTreasury] = await Promise.all([
    listTillClosings({ view: tab, search: q, filters: parseFilters(filtersRaw), sort: parseSort(sortRaw) }),
    hasAnyTillClosings(tab).then((any) => !any),
    currentCanAction('TILL_CLOSINGS_CREATE'),
    currentCanAction('TILL_CLOSINGS_POST'),
    closableTillsForUser(user.username),
    listTreasuryAccounts(),
    treasurySetupForUser(user.username).then((s) => !!s),
  ]);
  // The board of every till is for those who oversee them — treasury users and posters.
  const board = isTreasury || canPost ? await tillStatusBoard() : [];
  const fields = TILL_CLOSING_FILTER_FIELDS.map((f) => (
    f.key === 'till_bank_account_id' ? { ...f, options: board.length ? board.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })) : tills.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })) } : f
  ));

  return (
    <Page title="Till Closings" crumb="End of day: count the drawer, book the variance, hand the cash to treasury" user={user}>
      {board.length ? (
        <CollapsibleCard title="Tills today" sub={`Where every till stands on ${formatDate(today())}`}>
          <TableWrap>
            <thead><tr><th>Till</th><th>Cashier</th><th className="num">Balance now</th><th>Last closed</th><th>Closing in progress</th><th className="num">Awaiting posting</th></tr></thead>
            <tbody>
              {board.map((t) => {
                const closedToday = t.last_closed_date === today();
                return (
                  <tr key={t.id}>
                    <td><b className="mono">{t.code}</b><div className="tiny muted-cell">{t.name}</div></td>
                    <td>{t.cashier_username ?? <span className="muted-cell">unassigned</span>}</td>
                    <td className="num"><Money cents={t.balance} /></td>
                    <td>{t.last_closed_date ? <>{formatDate(t.last_closed_date)} <Link href={`/till-closings/view/${t.last_closing_no}`} className="tiny mono">{t.last_closing_no}</Link></> : <span className="muted-cell">never</span>}
                      {closedToday ? <> <Pill status="Closed" /></> : null}</td>
                    <td>{t.open_closing_no ? <Link href={`/till-closings/view/${t.open_closing_no}`} className="mono">{t.open_closing_no}</Link> : '—'}</td>
                    <td className="num">{Number(t.in_flight) ? <span className="neg">{t.in_flight}</span> : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </CollapsibleCard>
      ) : null}
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => `/till-closings/${k}`} />
      <Toolbar>
        <SearchInput placeholder="Search float, cashier or document no.…" disabled={empty} />
        <DynamicFilterBar fields={fields} disabled={empty} />
        <ExportButton href="/api/export/list/till-closings" params={{ q, view: tab, filters: filtersRaw, sort: sortRaw }} disabled={!rows.length} />
        <Spacer />
        {canCreate ? <NewClosingButton tills={tills} treasuries={treasuries} /> : null}
      </Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th><SortLink sortKey="no">No.</SortLink></th>
                <th><SortLink sortKey="closing_date">Day</SortLink></th>
                <th><SortLink sortKey="till">Till</SortLink></th>
                <th><SortLink sortKey="cashier">Cashier</SortLink></th>
                <th className="num"><SortLink sortKey="system">System</SortLink></th>
                <th className="num"><SortLink sortKey="counted">Counted</SortLink></th>
                <th className="num"><SortLink sortKey="variance">Variance</SortLink></th>
                <th className="num">Handed over</th>
                <th><SortLink sortKey="status">Status</SortLink></th>
                <th className="num" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOwn = r.created_by === user.username;
                const v = Number(r.variance);
                return (
                  <tr key={r.no}>
                    <td className="mono"><Link href={`/till-closings/view/${r.no}?view=${tab}`}>{r.no}</Link></td>
                    <td>{formatDate(r.closing_date)}</td>
                    <td><b className="mono">{r.till_code}</b><div className="tiny muted-cell">{r.till_name}</div></td>
                    <td>{r.cashier_username}</td>
                    <td className="num"><Money cents={r.system_balance} /></td>
                    <td className="num"><Money cents={r.counted_amount} /></td>
                    <td className="num">{v ? <span className={v < 0 ? 'neg' : undefined}><Money cents={v} /></span> : <span className="muted-cell">—</span>}</td>
                    <td className="num">{r.return_to_treasury ? <Money cents={r.posted ? r.returned_amount : r.counted_amount} /> : <span className="muted-cell">float kept</span>}</td>
                    <td><Pill status={r.posted ? 'Posted' : r.status} /></td>
                    <td className="num">
                      <div className="inline" style={{ justifyContent: 'flex-end' }}>
                        {r.status === 'Open' && canCreate && isOwn ? <SubmitButton no={r.no} /> : null}
                        {r.status === 'Pending Approval' && canCreate && isOwn ? <CancelApprovalButton no={r.no} /> : null}
                        {r.status === 'Approved' && !r.posted && canPost ? <PostButton closing={r} /> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState icon="🔐" title="No till closings here"
            sub="At the end of the day the cashier counts the float against what the ledger expects; a supervisor approves the count and any variance, and posting books the difference, hands the cash to treasury and locks the till for that day." />
        )}
      </Card>
    </Page>
  );
}
