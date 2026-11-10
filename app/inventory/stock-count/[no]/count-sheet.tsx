'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHead } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useFormat } from '@/components/ui/format-provider';
import { saveStockCountRequest, postStockCountRequest, cancelStockCountRequest } from '@/app/actions/inventory';
import type { StockCountLine } from '@/lib/stockCount';

/**
 * The count sheet: one row per item, the system quantity beside an input for what is on the
 * shelf. The difference and its approximate value update as you type; posting values it exactly
 * from the store's lots. Rows whose stock moved since the count opened are flagged.
 */
export function StockCountSheet({ no, lines, open, canEnter, canPost, openedByMe }: {
  no: string; lines: StockCountLine[]; open: boolean; canEnter: boolean; canPost: boolean; openedByMe: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { cur } = useFormat();
  const [counts, setCounts] = useState<Record<number, string>>(() => Object.fromEntries(lines.map((l) => [l.id, l.qty_counted == null ? '' : String(l.qty_counted)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const dirty = lines.some((l) => counts[l.id] !== (l.qty_counted == null ? '' : String(l.qty_counted)));
  const run = async (kind: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(kind);
    try {
      const res = await fn();
      if (!res.ok) { toast('Not done', res.error ?? 'Failed', 'err'); return; }
      toast(ok, '', 'ok');
      router.refresh();
    } finally { setBusy(null); }
  };
  const save = () => run('save', () => saveStockCountRequest(no, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v]))), 'Counts saved');

  const shown = lines.filter((l) => !filter || `${l.item_no} ${l.description}`.toLowerCase().includes(filter.toLowerCase()));
  const counted = lines.filter((l) => counts[l.id] !== '').length;
  const estVariance = lines.reduce((a, l) => (counts[l.id] === '' ? a : a + (Number(counts[l.id]) - l.qty_calculated) * Number(l.unit_cost)), 0);

  return (
    <Card>
      <CardHead title="Count sheet" sub={`${counted} of ${lines.length} counted · estimated variance ${cur(Math.round(estVariance))}`} />
      <div className="inline" style={{ marginBottom: 8 }}>
        <input type="search" placeholder="Find an item…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find an item" />
        <span style={{ flex: 1 }} />
        {canEnter ? <button type="button" className="btn ghost" disabled={!!busy || !dirty} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save counts'}</button> : null}
        {canEnter ? <button type="button" className="btn ghost danger" disabled={!!busy} onClick={() => run('cancel', () => cancelStockCountRequest(no), 'Count cancelled')}>Cancel count</button> : null}
        {canPost ? (
          <button type="button" className="btn" disabled={!!busy || dirty || counted < lines.length}
            title={dirty ? 'Save the counts first' : counted < lines.length ? 'Every item needs a count (0 if none)' : ''}
            onClick={() => run('post', () => postStockCountRequest(no), 'Count posted — stock corrected')}>
            {busy === 'post' ? 'Posting…' : 'Post count'}
          </button>
        ) : open && openedByMe ? <span className="tiny">Another user posts this count.</span> : null}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Unit</th><th className="num">System</th><th className="num">Counted</th><th className="num">Difference</th><th className="num">≈ Value</th></tr></thead>
          <tbody>
            {shown.map((l) => {
              const v = counts[l.id];
              const diff = v === '' ? null : Number(v) - l.qty_calculated;
              const moved = open && l.on_hand_now !== l.qty_calculated;
              return (
                <tr key={l.id}>
                  <td>{l.description}<div className="tiny mono">{l.item_no}{moved ? <span className="warn-text"> · stock moved since the count opened</span> : null}</div></td>
                  <td className="tiny">{l.unit}</td>
                  <td className="num">{l.qty_calculated.toLocaleString()}</td>
                  <td className="num">
                    {canEnter ? (
                      <input type="number" min={0} step={1} inputMode="numeric" value={v} aria-label={`Counted ${l.description}`} style={{ maxWidth: 110, textAlign: 'right' }}
                        onChange={(e) => setCounts((c) => ({ ...c, [l.id]: e.target.value }))} />
                    ) : (l.qty_counted ?? '—')}
                  </td>
                  <td className={`num${diff ? (diff < 0 ? ' danger-text' : ' warn-text') : ''}`}>{diff == null ? '' : diff > 0 ? `+${diff}` : diff}</td>
                  <td className="num">{l.variance_amount != null ? cur(Number(l.variance_amount)) : diff ? cur(Math.round(diff * Number(l.unit_cost))) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
