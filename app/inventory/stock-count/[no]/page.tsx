import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { getStockCount } from '@/lib/stockCount';
import { formatDate, formatDateTime } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Pill, Toolbar, Spacer } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money';
import { StockCountSheet } from './count-sheet';

export default async function StockCountPage({ params }: { params: Promise<{ no: string }> }) {
  const user = await requireAction('STOCK_COUNT_READ');
  const { no } = await params;
  const c = await getStockCount(decodeURIComponent(no));
  if (!c) notFound();
  const open = c.status === 'OPEN';
  return (
    <Page title={`Stock count ${c.no}`} crumb={`${c.location_code} — ${c.location_name} · ${formatDate(c.count_date)}`} user={user}>
      <Toolbar>
        <Link className="btn ghost" href="/inventory/stock-count">← All counts</Link>
        <Pill tone={c.status === 'POSTED' ? 'ok' : open ? 'info' : 'warn'}>{c.status.toLowerCase()}</Pill>
        <Spacer />
        <span className="tiny">Opened by {c.created_by} · {formatDateTime(c.created_at)}{c.posted_by ? ` · posted by ${c.posted_by}` : ''}</span>
        {c.status === 'POSTED' ? <span>Variance <b><Money cents={Number(c.total_variance)} /></b>{c.journal_no ? ` · ${c.journal_no}` : ''}</span> : null}
      </Toolbar>
      {c.notes ? <p className="note">{c.notes}</p> : null}
      <StockCountSheet
        no={c.no} lines={c.lines} open={open}
        canEnter={open && canAction(user, 'STOCK_COUNT_ENTER')}
        // Maker-checker: the person who opened the count does not post it (the server enforces it too).
        canPost={open && canAction(user, 'STOCK_COUNT_POST') && c.created_by !== user.username}
        openedByMe={c.created_by === user.username}
      />
    </Page>
  );
}
