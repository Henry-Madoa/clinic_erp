import Link from 'next/link';
import { canAction } from '@/lib/permissions';
import { listStockCounts, STOCK_COUNT_FILTER_FIELDS } from '@/lib/stockCount';
import { filterRows, parseFilters } from '@/lib/listFilters';
import { ListTools } from '@/components/ui/list-tools';
import { listActiveLocations } from '@/lib/inventorySetup';
import { formatDate, formatDateTime, today } from '@/lib/format';
import { Card, CardHead, EmptyState, Pill, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { Field } from '@/components/ui/field';
import { Money } from '@/components/ui/money';
import { ModalFormButton } from '@/components/ui/modal-form';
import { openStockCountRequest } from '@/app/actions/inventory';
import type { SessionUser } from '@/lib/types';

/** Physical stock counts: open one per store, count, and have someone else post the variance. */
export async function StockCountTab({ user, filters }: { user: SessionUser; filters?: string }) {
  if (!canAction(user, 'STOCK_COUNT_READ')) return <EmptyState icon="🔒" title="Stock counts are not in your permission set" />;
  const [allCounts, locations] = await Promise.all([listStockCounts(), listActiveLocations()]);
  const counts = filterRows(allCounts, STOCK_COUNT_FILTER_FIELDS, parseFilters(filters));
  return (
    <>
      <Toolbar>
        <ListTools exportKey="stock-counts" fields={STOCK_COUNT_FILTER_FIELDS} filters={filters} count={counts.length} />
        <Spacer />
        {canAction(user, 'STOCK_COUNT_ENTER') ? (
          <ModalFormButton label="New count" title="Open a stock count" action={openStockCountRequest} successTitle="Count opened"
            redirectPrefix="/inventory/stock-count/" redirectField="no">
            <Field name="location_id" label="Store" type="select" required options={[{ value: '', label: '…' }, ...locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))]} />
            <Field name="count_date" label="Count date" type="date" required defaultValue={today()} />
            <Field name="notes" label="Notes" maxLength={500} placeholder="e.g. month-end count, counted by…" />
          </ModalFormButton>
        ) : null}
      </Toolbar>
      <Card>
        <CardHead title="Stock counts" sub="A count snapshots the store, you enter what is on the shelf, and a second person posts the difference" />
        {counts.length ? (
          <TableWrap>
            <thead><tr><th>No.</th><th>Store</th><th>Date</th><th>Status</th><th className="num">Counted</th><th className="num">Variance</th><th>Journal</th><th>Opened</th><th>Posted</th></tr></thead>
            <tbody>{counts.map((c) => (
              <tr key={c.id}>
                <td className="mono"><Link href={`/inventory/stock-count/${c.no}`}>{c.no}</Link></td>
                <td>{c.location_code}</td><td>{formatDate(c.count_date)}</td>
                <td><Pill tone={c.status === 'POSTED' ? 'ok' : c.status === 'OPEN' ? 'info' : 'warn'}>{c.status.toLowerCase()}</Pill></td>
                <td className="num">{c.lines_counted} / {c.lines_total}</td>
                <td className="num">{c.status === 'POSTED' ? <Money cents={Number(c.total_variance)} /> : '—'}</td>
                <td className="mono">{c.journal_no ?? '—'}</td>
                <td className="tiny">{c.created_by} · {formatDateTime(c.created_at)}</td>
                <td className="tiny">{c.posted_by ? `${c.posted_by} · ${formatDateTime(c.posted_at!)}` : ''}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="📋" title="No stock counts yet" />}
      </Card>
    </>
  );
}
