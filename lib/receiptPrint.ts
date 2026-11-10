/*
 * The KRA eTIMS tax invoice for a posted sale:
 *
 *   /print/etims/<SALES_INVOICE|SALES_CREDIT_MEMO>-<posted no>
 *
 * KRA's signed data with its verification QR (or, until KRA has answered, a note that the signed
 * copy follows) — see lib/etims.ts. The ordinary posted invoice (/print/posted-sales/<no>) also
 * carries the eTIMS block once signed.
 */
import { one } from './db.ts';
import { formatDateTime } from './format.ts';
import { printBrand, documentMoney } from './documentPrint.ts';
import { etimsReceiptHtml, etimsFor } from './etims.ts';
import type { PrintDocument } from './documentPrint.ts';
import type { EtimsSourceType } from './types.ts';

export async function buildEtimsInvoicePrint(key: string): Promise<PrintDocument | null> {
  const m = /^(SALES_INVOICE|SALES_CREDIT_MEMO)-(.+)$/.exec(key);
  if (!m) return null;
  const sourceType = m[1] as EtimsSourceType;
  const inv = sourceType === 'SALES_CREDIT_MEMO'
    ? await one<Awaited<ReturnType<typeof etimsFor>>>("SELECT * FROM etims_invoice WHERE source_type = ? AND source_no = ?", sourceType, m[2])
    : await etimsFor(sourceType, m[2]);
  if (!inv) return null;
  const brand = await printBrand();
  if (!brand) return null;
  const money = documentMoney(brand, brand.currency_code);
  const payload = (await one<{ payload: { itemList?: { itemNm: string; qty: number; prc: number; taxTyCd: string; taxAmt: number; totAmt: number }[]; totTaxblAmt?: number } | null }>(
    'SELECT payload FROM etims_invoice WHERE id = ?', inv.id))?.payload;
  const items = payload?.itemList ?? [];
  return {
    brand,
    title: sourceType === 'SALES_CREDIT_MEMO' ? 'Tax Credit Note' : 'Tax Invoice',
    subtitle: `KRA eTIMS ${inv.invc_no ? `invoice ${inv.invc_no}` : '(awaiting signature)'} — ${sourceType === 'SALES_CREDIT_MEMO' ? 'credit memo' : 'invoice'} ${inv.source_no}`,
    watermark: inv.status === 'SIGNED' ? null : 'NOT YET SIGNED',
    status: { label: inv.status, tone: inv.status === 'SIGNED' ? 'ok' : inv.status === 'FAILED' ? 'bad' : 'warn' },
    parties: [{ heading: 'Customer', name: inv.cust_name ?? 'Customer', lines: inv.cust_tin ? [`KRA PIN ${inv.cust_tin}`] : [] }],
    meta: [
      { label: 'Invoice No.', value: inv.invc_no ? String(inv.invc_no) : '—' },
      { label: sourceType === 'SALES_CREDIT_MEMO' ? 'Credit memo' : 'Posted invoice', value: inv.source_no },
      { label: 'Date', value: formatDateTime(inv.signed_at ?? inv.created_at) },
    ],
    columns: [
      { key: 'item', label: 'Item' }, { key: 'qty', label: 'Qty', align: 'right', width: '10%' },
      { key: 'price', label: 'Price', align: 'right', width: '17%' }, { key: 'band', label: 'Tax', align: 'center', width: '8%' },
      { key: 'vat', label: 'VAT', align: 'right', width: '15%' }, { key: 'amount', label: 'Amount', align: 'right', width: '18%' },
    ],
    rows: items.map((i) => ({ cells: {
      item: i.itemNm, qty: String(i.qty), price: money(Math.round(i.prc * 100)), band: i.taxTyCd, vat: money(Math.round(i.taxAmt * 100)), amount: money(Math.round(i.totAmt * 100)),
    } })),
    empty: 'The invoice lines appear once it has been sent to KRA.',
    totals: [
      ...(payload?.totTaxblAmt != null ? [{ label: 'Taxable amount', value: money(Math.round(payload.totTaxblAmt * 100)) }] : []),
      { label: 'VAT', value: money(Number(inv.tax_total)) },
      { label: `Total (${brand.currency_code})`, value: money(Number(inv.total)), grand: true },
    ],
    extra_html: await etimsReceiptHtml(sourceType, inv.source_no),
    footnote: 'Tax bands: A exempt · B 16% VAT · C zero-rated · D non-VAT · E 8%.',
  };
}
