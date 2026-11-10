'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './toast';
import { useFormat } from './format-provider';
import { saveCashTransferDenominations } from '@/app/actions/cashManagement';
import { saveTillCount } from '@/app/actions/tillClosings';
import type { DenominationDocumentKind, DenominationLine } from '@/lib/types';

/**
 * The cash denomination breakdown grid — AL "Transaction Denominations" subpage. Shared by the
 * Cash Office Transfer and Till Closing cards. Read-only unless `editable`; when editable,
 * "Save breakdown" persists the non-zero rows through the matching server action.
 */
export function DenominationGrid({
  kind, docNo, lines, amount, editable, amountLabel = 'Document amount', varianceMode = false,
}: {
  kind: DenominationDocumentKind;
  docNo: string;
  lines: DenominationLine[];
  amount: number;
  editable: boolean;
  /** What `amount` is called in the footer — a till count compares against the "System balance". */
  amountLabel?: string;
  /** A till count is allowed to differ from `amount`: the difference is the variance, not an error. */
  varianceMode?: boolean;
}) {
  const { cur } = useFormat();
  const toast = useToast();
  const router = useRouter();
  const [qty, setQty] = useState<Record<number, number>>(
    () => Object.fromEntries(lines.map((l) => [l.denomination_id, l.quantity])),
  );
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (qty[l.denomination_id] || 0) * l.value, 0),
    [lines, qty],
  );
  const balanced = total === amount;

  const save = async () => {
    setBusy(true);
    try {
      const rows = lines
        .map((l) => ({ denominationId: l.denomination_id, quantity: qty[l.denomination_id] || 0 }))
        .filter((r) => r.quantity > 0);
      const action = kind === 'TRANSFER' ? saveCashTransferDenominations : saveTillCount;
      const res = await action(docNo, rows);
      if (!res.ok) { toast('Could not save breakdown', res.error, 'err'); return; }
      toast('Denomination breakdown saved', undefined, 'ok');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Denomination</th>
            <th className="num">Unit value</th>
            <th className="num" style={{ width: 120 }}>Quantity</th>
            <th className="num">Line total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.denomination_id}>
              <td>{l.description}</td>
              <td className="num">{cur(l.value)}</td>
              <td className="num">
                {editable ? (
                  <input
                    type="number" min={0} step={1} value={qty[l.denomination_id] ?? 0}
                    aria-label={`${l.description} quantity`}
                    style={{ width: 100, textAlign: 'right' }}
                    onChange={(e) => setQty((c) => ({ ...c, [l.denomination_id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  />
                ) : (qty[l.denomination_id] || 0)}
              </td>
              <td className="num">{cur((qty[l.denomination_id] || 0) * l.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="num"><b>Breakdown total</b></td>
            <td className="num">
              <b style={{ color: balanced || varianceMode ? undefined : 'var(--bad, #c0392b)' }}>{cur(total)}</b>
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="tiny" style={{ marginTop: 6 }}>
        {amountLabel} {cur(amount)} — {balanced ? (varianceMode ? 'the count agrees' : 'breakdown balances')
          : varianceMode ? `${total < amount ? 'short' : 'over'} by ${cur(Math.abs(total - amount))}` : `off by ${cur(Math.abs(total - amount))}`}
      </div>
      {editable ? (
        <div className="inline" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : varianceMode ? 'Save count' : 'Save breakdown'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
