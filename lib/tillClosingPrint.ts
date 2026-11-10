/*
 * Till closing count sheet — the end-of-day printout the cashier and the supervisor both sign:
 * the note & coin count line by line, the ledger's figures for the day, the variance and the
 * handover. No AL report exists for this; the layout follows the other cash office slips.
 */
import { formatDate } from './format.ts';
import { amountInWords } from './numberToWords.ts';
import { printBrand, documentMoney, documentSignatories, currencyLabel, type PrintDocument, type PrintRow } from './documentPrint.ts';
import { getDenominationLines } from './denominations.ts';
import { getTillClosing, tillDayEntries } from './tillClosings.ts';

export async function buildTillClosingPrint(no: string): Promise<PrintDocument | null> {
  const c = await getTillClosing(no);
  if (!c) return null;
  const brand = await printBrand();
  if (!brand) return null;
  const money = documentMoney(brand, null);
  const [lines, entries] = await Promise.all([getDenominationLines('TILL_CLOSING', no), tillDayEntries(c.till_bank_account_id, c.closing_date)]);
  const v = Number(c.variance);
  const rows: PrintRow[] = lines.filter((l) => l.quantity > 0).map((l) => ({
    cells: { denomination: l.description, value: money(Number(l.value)), quantity: String(l.quantity), total: money(Number(l.total)) },
  }));
  return {
    brand,
    title: 'Till Closing',
    subtitle: `${c.till_code} — ${c.till_name} · ${formatDate(c.closing_date)}`,
    watermark: c.posted ? null : c.status.toUpperCase(),
    status: { label: c.posted ? 'Posted' : c.status, tone: c.posted ? 'ok' : c.status === 'Approved' ? 'ok' : 'warn' },
    parties: [{ heading: 'Cashier', name: c.cashier_username, lines: [`Till ${c.till_code}`, c.return_to_treasury ? `Cash to ${c.treasury_code ?? 'treasury'}` : 'Float kept in till'] }],
    meta: [
      { label: 'Document No.', value: c.no },
      { label: 'Closing Date', value: formatDate(c.closing_date) },
      { label: 'Opening balance', value: money(Number(c.opening_balance)) },
      { label: 'Cash in', value: money(Number(c.cash_in)) },
      { label: 'Cash out', value: money(Number(c.cash_out)) },
      { label: 'System balance', value: money(Number(c.system_balance)), strong: true },
      ...(c.variance_journal_no ? [{ label: 'Variance journal', value: c.variance_journal_no }] : []),
      ...(c.handover_journal_no ? [{ label: 'Handover journal', value: c.handover_journal_no }] : []),
    ],
    columns: [
      { key: 'denomination', label: 'Denomination' },
      { key: 'value', label: 'Unit value', align: 'right', width: '20%' },
      { key: 'quantity', label: 'Quantity', align: 'right', width: '16%' },
      { key: 'total', label: 'Line total', align: 'right', width: '22%' },
    ],
    rows,
    empty: 'No cash counted.',
    totals: [
      { label: 'Counted', value: money(Number(c.counted_amount)), grand: true },
      { label: 'System balance', value: money(Number(c.system_balance)) },
      { label: v < 0 ? 'Shortage' : v > 0 ? 'Overage' : 'Variance', value: money(Math.abs(v)), negative: v < 0 },
      ...(c.return_to_treasury ? [{ label: 'Handed to treasury', value: money(Number(c.posted ? c.returned_amount : c.counted_amount)) }] : []),
    ],
    sections: [{
      heading: 'The day’s movements',
      sub: `Ledger entries on ${c.till_code} dated ${formatDate(c.closing_date)}`,
      badge: money(Number(c.system_balance)),
      columns: [
        { key: 'journal', label: 'Journal', width: '16%' },
        { key: 'document', label: 'Document', width: '16%' },
        { key: 'description', label: 'Description' },
        { key: 'in', label: 'In', align: 'right', width: '14%' },
        { key: 'out', label: 'Out', align: 'right', width: '14%' },
      ],
      rows: entries.map((e) => ({ cells: {
        journal: e.journal_no, document: e.document_no ?? '', description: e.description ?? '',
        in: Number(e.amount) > 0 ? money(Number(e.amount)) : '', out: Number(e.amount) < 0 ? money(-Number(e.amount)) : '',
      } })),
      empty: 'Nothing moved on this till that day.',
    }],
    amount_words: amountInWords(Number(c.counted_amount), currencyLabel(null)),
    notes: c.variance_reason ? [{ heading: 'Variance reason', body: c.variance_reason }] : [],
    approvals: await documentSignatories('TILL_CLOSING', c.no, c.created_by, { raisedAt: c.created_at, clearedBy: c.posted_by ?? c.created_by }),
    acknowledgement: c.return_to_treasury ? { title: 'Received into treasury', fields: ['Name', 'Signature', 'Date'] } : null,
    footnote: 'Counted in the presence of the cashier and the checking officer. A shortage stands against the cashier until made good.',
  };
}
