/*
 * VAT + Withholding Tax engine — the shared arithmetic and the VAT Entry ledger. The AL
 * "SACCODEMO" localization (Cod52203434, Tab52203440) reuses Business Central's VAT Posting Setup
 * for both taxes: a VAT Product Posting Group carries a Type of VAT | WHT, and the setup row for a
 * (VAT Bus. Posting Group × Code) pair holds the % and the G/L account — the input-VAT account for
 * VAT rows, the tax-payable account for WHT rows.
 *
 * Rounding follows the AL: `Round(x, 1, '>')` — to the whole cent, always up.
 */
import { one, run } from './db.ts';
import { AppError } from './errors.ts';
import { toLcy } from './currency.ts';
import { addVatToNet, extractVatFromGross } from './documentTotals.ts';
import type { Cents, IsoDate, TaxType, VatCalculationType } from './types.ts';

interface ResolvedVatSetup {
  tax_type: TaxType;
  vat_pct: number;
  vat_calculation_type: VatCalculationType;
  tax_account_id: number | null;
  wht_base: 'Net' | 'Gross';
}

/** BC "VAT Posting Setup".Get — throws (AL parity) when the pair is not set up. */
export async function resolveVatSetup(
  vatBusCode: string | null | undefined, vatProdCode: string | null | undefined,
): Promise<ResolvedVatSetup | null> {
  if (!vatProdCode) return null;
  const bus = vatBusCode ?? '';
  const row = await one<ResolvedVatSetup & { blocked: number }>(
    `SELECT tax_type, vat_pct, vat_calculation_type, tax_account_id, wht_base, blocked
     FROM vat_posting_setup
     WHERE vat_bus_posting_group_code = ? AND vat_prod_posting_group_code = ?`,
    bus, vatProdCode,
  );
  if (!row) {
    throw new AppError(
      `There is no VAT Posting Setup for ${bus || '(blank)'} × ${vatProdCode} — ask an administrator to add it`,
      'NO_VAT_POSTING_SETUP',
    );
  }
  if (row.blocked) throw new AppError(`VAT Posting Setup ${bus} × ${vatProdCode} is blocked`, 'VALIDATION');
  return {
    tax_type: row.tax_type, vat_pct: row.vat_pct, vat_calculation_type: row.vat_calculation_type,
    tax_account_id: row.tax_account_id, wht_base: row.wht_base,
  };
}

// The arithmetic itself lives in lib/documentTotals.ts, which has no database import so the
// document line editor can preview these very numbers as the user types. Re-exported here
// because the posting routines have always reached for them through this module.
export { extractVatFromGross, addVatToNet };


interface PostVatEntryInput {
  postingDate: IsoDate;
  documentType: string;
  documentNo: string;
  type?: 'Purchase' | 'Settlement';
  taxType: TaxType;
  vatBus: string | null;
  vatProd: string | null;
  vatPct: number;
  /** FCY figures — LCY is derived with `currencyFactor`. */
  base: Cents;
  amount: Cents;
  currencyCode?: string;
  currencyFactor?: number;
  vendorNo?: string | null;
  vendorPin?: string | null;
  whtCertificateNo?: string | null;
  journalId?: number | null;
  sourceType?: string | null;
  sourceId?: number | null;
}

export async function postVatEntry(i: PostVatEntryInput): Promise<number> {
  const factor = i.currencyFactor && i.currencyFactor > 0 ? i.currencyFactor : 1;
  const code = i.currencyCode || 'KES';
  const info = await run(
    `INSERT INTO vat_entry
       (posting_date, document_type, document_no, type, tax_type, vat_bus_posting_group_code,
        vat_prod_posting_group_code, vat_pct, base, amount, base_fcy, amount_fcy, currency_code,
        currency_factor, bill_to_pay_to_no, vendor_pin, wht_certificate_no, journal_id,
        source_type, source_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    i.postingDate, i.documentType, i.documentNo, i.type ?? 'Purchase', i.taxType, i.vatBus, i.vatProd,
    i.vatPct, toLcy(i.base, factor), toLcy(i.amount, factor), i.base, i.amount, code, factor,
    i.vendorNo ?? null, i.vendorPin ?? null, i.whtCertificateNo ?? null, i.journalId ?? null,
    i.sourceType ?? null, i.sourceId ?? null, new Date().toISOString(),
  );
  return Number(info.lastInsertRowid);
}

