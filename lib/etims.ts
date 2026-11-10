import 'server-only';
/*
 * KRA eTIMS — Online Sales Control Unit (OSCU) integration.
 *
 * Every taxable sale is reported to KRA and signed: a posted sales invoice or credit memo
 * from Receivables (projects, contracts and direct sales all post there). A sale is queued in etims_invoice inside
 * the transaction that closes it (the outbox), then sent: straight after the sale, and again by
 * the ETIMS_SUBMIT job until KRA answers — so KRA's latency or an outage never blocks posting.
 *
 *   device    POST {base}/selectInitOsdcInfo   { tin, bhfId, dvcSrlNo }   → data.info.cmcKey, sdcId, mrcNo
 *   sale      POST {base}/saveTrnsSalesOsdc    headers tin, bhfId, cmcKey → data.curRcptNo, totRcptNo,
 *                                                                         intrlData, rcptSign, sdcDateTime
 *
 * Rules followed: invcNo is the branch's gap-free sequence, allocated only when the invoice is
 * first transmitted (and reused on a retry); a signed invoice is never changed (corrections are
 * credit notes, rcptTyCd R); per line taxblAmt + taxAmt = totAmt and the header totals are the
 * sums of the lines; resultCd is a string ('000' = signed). A network failure retries with
 * back-off; a rejection by KRA is not retried blindly — it is parked FAILED for someone to read.
 * The cmcKey is a long-lived credential: sealed at rest like the other integration secrets.
 * Full request and response are kept with every invoice.
 */
import QRCode from 'qrcode';
import { one, all, run, tx, audit } from './db.ts';
import { AppError } from './errors.ts';
import { esc } from './documentPrint.ts';
import { readIntegration, writeIntegration, openSecret, nextSecret } from './integrationSettings.ts';
import type { Actor, Cents, EtimsInvoice, EtimsSourceType } from './types.ts';

export type EtimsEnvironment = 'sandbox' | 'production';
export const ETIMS_HOSTS: Record<EtimsEnvironment, string> = {
  sandbox: 'https://etims-api-sbx.kra.go.ke/etims-api',
  production: 'https://etims-api.kra.go.ke/etims-api',
};
const VERIFY_HOSTS: Record<EtimsEnvironment, string> = {
  sandbox: 'https://etims-sbx.kra.go.ke',
  production: 'https://etims.kra.go.ke',
};

/** KRA tax bands: A exempt, B 16% VAT, C zero-rated, D non-VAT, E 8%. */
export type TaxBand = 'A' | 'B' | 'C' | 'D' | 'E';
const BAND_RATE: Record<TaxBand, number> = { A: 0, B: 16, C: 0, D: 0, E: 8 };

/** OSCU payment types: 01 cash, 02 credit, 03 cash/credit, 04 bank cheque, 05 card, 06 mobile money, 07 other. */
const PAYMENT_TYPE: Record<string, string> = { CASH: '01', CARD: '05', MPESA: '06', BANK: '07', BANKTRF: '07', CHEQUE: '04' };
const paymentType = (code: string | null | undefined): string => PAYMENT_TYPE[String(code ?? '').toUpperCase()] ?? '07';

/* ---------------------------------------------------------------- settings */

export interface EtimsSettingsInput {
  enabled: boolean; environment: EtimsEnvironment; tin: string; bhfId: string; dvcSrlNo: string;
  itemClsCd: string; nonVatBand: TaxBand; cmcKey: string;
}

export interface EtimsSettingsInfo {
  enabled: boolean; environment: EtimsEnvironment; tin: string; bhfId: string; dvcSrlNo: string; itemClsCd: string; nonVatBand: TaxBand;
  hasCmcKey: boolean; cmcKeyUnreadable: boolean; sdcId: string; mrcNo: string; initialisedAt: string | null;
  updatedAt: string | null; updatedBy: string | null;
}

export async function getEtimsSettingsInfo(): Promise<EtimsSettingsInfo> {
  const row = await readIntegration('etims');
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const s = (k: string, d = '') => (typeof v[k] === 'string' ? (v[k] as string) : d);
  return {
    enabled: v.enabled === true, environment: v.environment === 'production' ? 'production' : 'sandbox',
    tin: s('tin'), bhfId: s('bhfId', '00'), dvcSrlNo: s('dvcSrlNo'), itemClsCd: s('itemClsCd'),
    nonVatBand: (['A', 'C', 'D'].includes(s('nonVatBand')) ? s('nonVatBand') : 'A') as TaxBand,
    hasCmcKey: Boolean(v.cmcKey_enc), cmcKeyUnreadable: Boolean(v.cmcKey_enc) && !openSecret(v.cmcKey_enc),
    sdcId: s('sdcId'), mrcNo: s('mrcNo'), initialisedAt: s('initialisedAt') || null,
    updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null,
  };
}

export function cleanEtimsInput(raw: Record<string, unknown>): EtimsSettingsInput {
  const s = (k: string) => String(raw[k] ?? '').trim();
  const v: EtimsSettingsInput = {
    enabled: raw.enabled === 1 || raw.enabled === '1' || raw.enabled === true || raw.enabled === 'on',
    environment: s('environment') === 'production' ? 'production' : 'sandbox',
    tin: s('tin').toUpperCase(), bhfId: s('bhfId') || '00', dvcSrlNo: s('dvcSrlNo'), itemClsCd: s('itemClsCd'),
    nonVatBand: (['A', 'C', 'D'].includes(s('nonVatBand').toUpperCase()) ? s('nonVatBand').toUpperCase() : 'A') as TaxBand,
    cmcKey: s('cmcKey'),
  };
  const problem =
    (!/^[AP]\d{9}[A-Z]$/.test(v.tin) && 'Enter the company\'s KRA PIN, e.g. P051234567X') ||
    (!/^\d{2}$/.test(v.bhfId) && 'The branch ID is two digits — 00 for the head office') ||
    (!/^[A-Za-z0-9_-]{3,50}$/.test(v.dvcSrlNo) && 'Enter the device serial number registered with KRA for this OSCU') ||
    (!/^\d{5,10}$/.test(v.itemClsCd) && 'Enter the KRA item classification code your items are registered under') ||
    (v.cmcKey !== '' && !/^[A-Za-z0-9+/=_-]{16,200}$/.test(v.cmcKey) && 'The communication key does not look right — leave it blank and use Initialise device');
  if (problem) throw new AppError(problem, 'VALIDATION');
  return v;
}

export async function saveEtimsSettings(input: EtimsSettingsInput, user: Actor): Promise<void> {
  const existing = ((await readIntegration('etims'))?.value ?? {}) as Record<string, unknown>;
  // A key belongs to its device and PIN: a different one means initialising again.
  const sameDevice = existing.tin === input.tin && existing.bhfId === input.bhfId && existing.dvcSrlNo === input.dvcSrlNo && existing.environment === input.environment;
  const cmcKey_enc = nextSecret(input.cmcKey, sameDevice ? existing.cmcKey_enc : null);
  if (input.enabled && !openSecret(cmcKey_enc)) throw new AppError('Initialise the device (or enter its communication key) before switching eTIMS on', 'VALIDATION');
  const { cmcKey: _k, ...plain } = input;
  await writeIntegration('etims', {
    ...plain, cmcKey_enc,
    sdcId: sameDevice ? existing.sdcId ?? '' : '', mrcNo: sameDevice ? existing.mrcNo ?? '' : '', initialisedAt: sameDevice ? existing.initialisedAt ?? null : null,
  }, user.username);
  await audit(user, 'ETIMS_SETUP_SAVE', 'integration_setting', 'etims', {
    enabled: input.enabled, environment: input.environment, tin: input.tin, bhfId: input.bhfId, keyChanged: Boolean(input.cmcKey),
  });
}

type KraResponse = { resultCd?: string; resultMsg?: string; resultDt?: string; data?: Record<string, unknown> | null };

async function kraPost(url: string, headers: Record<string, string>, body: unknown): Promise<{ ok: true; res: KraResponse } | { ok: false; network: true; error: string }> {
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), cache: 'no-store',
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, network: true, error: `KRA answered HTTP ${r.status}` };
    try { return { ok: true, res: JSON.parse(text) as KraResponse }; } catch { return { ok: false, network: true, error: 'KRA answered with something that is not JSON' }; }
  } catch {
    return { ok: false, network: true, error: 'Could not reach KRA eTIMS (network error or timeout)' };
  }
}

/** "Initialise device": asks KRA for the OSCU's communication key and stores it sealed. */
export async function initialiseDevice(user: Actor): Promise<string> {
  const row = await readIntegration('etims');
  const v = (row?.value ?? {}) as Record<string, unknown>;
  if (!v.tin || !v.dvcSrlNo) throw new AppError('Save the KRA PIN, branch and device serial first', 'VALIDATION');
  const env: EtimsEnvironment = v.environment === 'production' ? 'production' : 'sandbox';
  const r = await kraPost(`${ETIMS_HOSTS[env]}/selectInitOsdcInfo`, {}, { tin: v.tin, bhfId: v.bhfId ?? '00', dvcSrlNo: v.dvcSrlNo });
  if (!r.ok) throw new AppError(r.error, 'ETIMS');
  const info = (r.res.data?.info ?? {}) as Record<string, unknown>;
  if (r.res.resultCd !== '000' || typeof info.cmcKey !== 'string') {
    await audit(user, 'ETIMS_INIT', 'integration_setting', 'etims', { ok: false, resultCd: r.res.resultCd ?? null });
    throw new AppError(`KRA did not initialise the device: ${String(r.res.resultMsg ?? r.res.resultCd ?? 'no reason given').slice(0, 200)}`, 'ETIMS');
  }
  await writeIntegration('etims', {
    ...v, cmcKey_enc: nextSecret(info.cmcKey, null), sdcId: String(info.sdcId ?? ''), mrcNo: String(info.mrcNo ?? ''),
    tradeNm: String(info.tradeNm ?? ''), initialisedAt: new Date().toISOString(),
  }, user.username);
  await audit(user, 'ETIMS_INIT', 'integration_setting', 'etims', { ok: true, sdcId: info.sdcId ?? null });
  return `Device initialised with KRA (${env})${info.sdcId ? ` — control unit ${String(info.sdcId)}` : ''}. Switch eTIMS on and save.`;
}

interface EtimsConfig { environment: EtimsEnvironment; tin: string; bhfId: string; cmcKey: string; itemClsCd: string; nonVatBand: TaxBand; sdcId: string; mrcNo: string }

async function getConfig(): Promise<EtimsConfig | null> {
  const v = ((await readIntegration('etims'))?.value ?? {}) as Record<string, unknown>;
  const cmcKey = openSecret(v.cmcKey_enc);
  if (v.enabled !== true || !cmcKey) return null;
  return {
    environment: v.environment === 'production' ? 'production' : 'sandbox', tin: String(v.tin), bhfId: String(v.bhfId ?? '00'), cmcKey,
    itemClsCd: String(v.itemClsCd ?? ''), nonVatBand: (['A', 'C', 'D'].includes(String(v.nonVatBand)) ? v.nonVatBand : 'A') as TaxBand,
    sdcId: String(v.sdcId ?? ''), mrcNo: String(v.mrcNo ?? ''),
  };
}

/** Whether sales are being reported — the queue is only written while it is. */
export const etimsEnabled = async (): Promise<boolean> => (await getConfig()) !== null;

/* -------------------------------------------------------------- the outbox */

/**
 * Queue a posted sale for signing — inside the transaction that posted it. Nothing is queued while
 * eTIMS is off, and a sale is queued once (unique source + receipt type). A credit memo is a
 * refund receipt (R) that names the signed invoice it corrects.
 */
export async function queueSale(sourceType: EtimsSourceType, sourceNo: string, user: Actor, orgInvcNo: number | null = null): Promise<number | null> {
  if (!(await etimsEnabled())) return null;
  const built = await buildSale(sourceType, sourceNo);
  if (!built || built.total <= 0) return null;
  const rcpt = sourceType === 'SALES_CREDIT_MEMO' ? 'R' : 'S';
  const existing = await one<{ id: number }>('SELECT id FROM etims_invoice WHERE source_type = ? AND source_no = ? AND rcpt_type = ?', sourceType, sourceNo, rcpt);
  if (existing) return existing.id;
  const info = await run(
    `INSERT INTO etims_invoice (source_type, source_no, rcpt_type, org_invc_no, status, cust_tin, cust_name, pmt_type, total, tax_total, created_at, created_by, next_attempt_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
    sourceType, sourceNo, rcpt, orgInvcNo, built.custTin, built.custName, built.pmtType, built.total, built.taxTotal, new Date().toISOString(), user.username, new Date().toISOString(),
  );
  return info.lastInsertRowid;
}

/** Called by postSalesDocument() for every posted invoice / credit memo. */
export async function queueEtimsForPostedSales(postedNo: string, user: Actor): Promise<number | null> {
  const d = await one<{ document_type: string; applies_to_doc_no: string | null }>('SELECT document_type, applies_to_doc_no FROM posted_sales_document WHERE no = ?', postedNo);
  if (!d || d.document_type === 'Shipment') return null;
  if (d.document_type === 'Credit Memo') {
    const org = d.applies_to_doc_no ? await one<{ invc_no: number | null }>("SELECT invc_no FROM etims_invoice WHERE source_type = 'SALES_INVOICE' AND source_no = ?", d.applies_to_doc_no) : undefined;
    return queueSale('SALES_CREDIT_MEMO', postedNo, user, org?.invc_no ?? null);
  }
  return queueSale('SALES_INVOICE', postedNo, user);
}

interface SaleLine { code: string; name: string; qty: number; gross: Cents; vat: Cents; band: TaxBand }
interface BuiltSale { lines: SaleLine[]; total: Cents; taxTotal: Cents; pmtType: string; custTin: string | null; custName: string | null; saleDate: string }

/** Spreads `total` over `weights` in proportion, the rounding remainder on the largest part. */
function allocate(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  const rest = total - parts.reduce((a, p) => a + p, 0);
  parts[weights.indexOf(Math.max(...weights))] += rest;
  return parts;
}

async function buildSale(sourceType: EtimsSourceType, sourceNo: string): Promise<BuiltSale | null> {
  const cfg = await getConfig();
  const nonVat: TaxBand = cfg?.nonVatBand ?? 'A';
  const docType = sourceType === 'SALES_CREDIT_MEMO' ? 'Credit Memo' : 'Invoice';
  const d = await one<{ id: number; posting_date: string; customer_name: string; kra_pin: string | null; payment_method_code: string | null }>(
    `SELECT d.id, d.posting_date, d.sell_to_name AS customer_name, c.kra_pin, c.payment_method_code
     FROM posted_sales_document d JOIN customer c ON c.id = d.customer_id WHERE d.no = ? AND d.document_type = ?`, sourceNo, docType);
  if (!d) return null;
  const items = await all<{ type: string; no: string | null; description: string | null; quantity: number; line_amount: Cents; vat_amount: Cents; vat_pct: number }>(
    "SELECT type, no, description, quantity, line_amount, vat_amount, vat_pct FROM posted_sales_line WHERE posted_sales_document_id = ? AND type <> 'Comment' ORDER BY line_no", d.id);
  // Lines are priced net of VAT; eTIMS wants each line's gross with its tax inside it.
  const lines: SaleLine[] = items.map((i) => {
    const vat = Number(i.vat_amount);
    const pct = Number(i.vat_pct);
    const band: TaxBand = pct >= 15 ? 'B' : pct > 0 ? 'E' : nonVat;
    return { code: `${i.type === 'G/L Account' ? 'GL' : i.type === 'Item' ? 'ITM' : 'FA'}-${i.no ?? ''}`, name: i.description || i.no || 'Services', qty: Number(i.quantity) || 1, gross: Number(i.line_amount) + vat, vat, band };
  }).filter((l) => l.gross > 0);
  const total = lines.reduce((a, l) => a + l.gross, 0);
  return {
    lines, total, taxTotal: lines.reduce((a, l) => a + l.vat, 0),
    // An invoice is a credit sale unless the client pays on delivery.
    pmtType: d.payment_method_code ? paymentType(d.payment_method_code) : '02',
    custTin: d.kra_pin, custName: d.customer_name, saleDate: d.posting_date,
  };
}

const amt = (c: Cents): number => Math.round(c) / 100;
const ymd = (iso: string): string => iso.replace(/-/g, '').slice(0, 8);
const eat = (d = new Date()): string => new Date(d.getTime() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);

/** The OSCU saveTrnsSalesOsdc body — every line balanced, the header the sum of the lines. */
export function salePayload(cfg: Pick<EtimsConfig, 'tin' | 'bhfId' | 'itemClsCd'>, inv: { invcNo: number; orgInvcNo: number; rcptType: 'S' | 'R'; pmtType: string; custTin: string | null; custName: string | null }, sale: BuiltSale, user: string) {
  const items = sale.lines.map((l, k) => {
    const taxAmt = l.vat;
    return {
      itemSeq: k + 1, itemCd: l.code.slice(0, 20), itemClsCd: cfg.itemClsCd, itemNm: l.name.slice(0, 200), bcd: null,
      pkgUnitCd: 'NT', pkg: l.qty, qtyUnitCd: 'U', qty: l.qty, prc: amt(Math.round(l.gross / l.qty)), splyAmt: amt(l.gross),
      dcRt: 0, dcAmt: 0, isrccCd: null, isrccNm: null, isrcRt: null, isrcAmt: null,
      taxTyCd: l.band, taxblAmt: amt(l.gross - taxAmt), taxAmt: amt(taxAmt), totAmt: amt(l.gross),
    };
  });
  const bands: TaxBand[] = ['A', 'B', 'C', 'D', 'E'];
  const sum = (band: TaxBand, k: 'taxblAmt' | 'taxAmt') => Math.round(items.filter((i) => i.taxTyCd === band).reduce((a, i) => a + i[k] * 100, 0)) / 100;
  const header: Record<string, unknown> = {
    tin: cfg.tin, bhfId: cfg.bhfId, invcNo: inv.invcNo, orgInvcNo: inv.orgInvcNo, trdInvcNo: null,
    custTin: inv.custTin, custNm: inv.custName?.slice(0, 60) ?? null, salesTyCd: 'N', rcptTyCd: inv.rcptType, pmtTyCd: inv.pmtType, salesSttsCd: '02',
    cfmDt: eat(), salesDt: ymd(sale.saleDate || new Date().toISOString()), stockRlsDt: null, cnclReqDt: null, cnclDt: null, rfdDt: null, rfdRsnCd: null,
    totItemCnt: items.length,
    totTaxblAmt: amt(sale.lines.reduce((a, l) => a + l.gross - l.vat, 0)), totTaxAmt: amt(sale.taxTotal), totAmt: amt(sale.total),
    prchrAcptcYn: 'N', remark: null, regrId: user.slice(0, 20), regrNm: user.slice(0, 60), modrId: user.slice(0, 20), modrNm: user.slice(0, 60),
    receipt: { custTin: inv.custTin, custMblNo: null, rptNo: null, rcptPbctDt: eat(), trdeNm: null, adrs: null, topMsg: null, btmMsg: null, prchrAcptcYn: 'N' },
    itemList: items,
  };
  for (const b of bands) {
    header[`taxblAmt${b}`] = sum(b, 'taxblAmt');
    header[`taxRt${b}`] = BAND_RATE[b];
    header[`taxAmt${b}`] = sum(b, 'taxAmt');
  }
  return header;
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 720];

/** Send one queued invoice. Never throws for a KRA problem — the row records what happened. */
export async function submitInvoice(id: number, user: Actor): Promise<EtimsInvoice['status']> {
  const cfg = await getConfig();
  if (!cfg) return 'PENDING';
  // Claim the row and, on its first send, the next invoice number — one sender at a time per branch.
  const claim = await tx(async () => {
    await run('SELECT pg_advisory_xact_lock(hashtext(?))', 'etims-invoice-no');
    const inv = await one<EtimsInvoice>("SELECT * FROM etims_invoice WHERE id = ? AND status = 'PENDING' FOR UPDATE SKIP LOCKED", id);
    if (!inv) return null;
    if (inv.invc_no == null) {
      const next = Number((await one<{ n: number }>('SELECT COALESCE(MAX(invc_no), 0) + 1 AS n FROM etims_invoice'))!.n);
      await run('UPDATE etims_invoice SET invc_no = ? WHERE id = ?', next, inv.id);
      inv.invc_no = next;
    }
    return inv;
  });
  if (!claim) return 'PENDING';
  const sale = await buildSale(claim.source_type, claim.source_no);
  if (!sale) {
    await run("UPDATE etims_invoice SET status = 'FAILED', last_error = ?, attempts = attempts + 1 WHERE id = ?", 'The sale no longer exists to report', claim.id);
    return 'FAILED';
  }
  const payload = salePayload(cfg, {
    invcNo: claim.invc_no!, orgInvcNo: claim.org_invc_no ?? 0, rcptType: claim.rcpt_type, pmtType: claim.pmt_type, custTin: claim.cust_tin, custName: claim.cust_name,
  }, sale, user.username);
  const r = await kraPost(`${ETIMS_HOSTS[cfg.environment]}/saveTrnsSalesOsdc`, { tin: cfg.tin, bhfId: cfg.bhfId, cmcKey: cfg.cmcKey }, payload);
  const now = new Date();
  if (!r.ok) {
    const wait = BACKOFF_MINUTES[Math.min(claim.attempts, BACKOFF_MINUTES.length - 1)];
    await run('UPDATE etims_invoice SET attempts = attempts + 1, last_error = ?, payload = ?::jsonb, next_attempt_at = ? WHERE id = ?',
      r.error, JSON.stringify(payload), new Date(now.getTime() + wait * 60_000).toISOString(), claim.id);
    return 'PENDING';
  }
  const d = (r.res.data ?? {}) as Record<string, unknown>;
  if (r.res.resultCd === '000' && typeof d.rcptSign === 'string') {
    await run(
      `UPDATE etims_invoice SET status = 'SIGNED', attempts = attempts + 1, last_error = NULL, payload = ?::jsonb, response = ?::jsonb,
         cur_rcpt_no = ?, tot_rcpt_no = ?, intrl_data = ?, rcpt_sign = ?, sdc_date_time = ?, sdc_id = ?, mrc_no = ?, signed_at = ? WHERE id = ?`,
      JSON.stringify(payload), JSON.stringify(r.res), d.curRcptNo != null ? Number(d.curRcptNo) : null, d.totRcptNo != null ? Number(d.totRcptNo) : null,
      typeof d.intrlData === 'string' ? d.intrlData : null, d.rcptSign, typeof d.sdcDateTime === 'string' ? d.sdcDateTime : null,
      cfg.sdcId || null, cfg.mrcNo || null, now.toISOString(), claim.id,
    );
    await audit(user, 'ETIMS_SIGNED', 'etims_invoice', claim.id, { source: `${claim.source_type} ${claim.source_no}`, invcNo: claim.invc_no });
    return 'SIGNED';
  }
  // KRA read it and said no: park it for a person — retrying the same body would only be refused again.
  await run("UPDATE etims_invoice SET status = 'FAILED', attempts = attempts + 1, last_error = ?, payload = ?::jsonb, response = ?::jsonb WHERE id = ?",
    `KRA ${r.res.resultCd ?? '?'}: ${String(r.res.resultMsg ?? 'refused').slice(0, 250)}`, JSON.stringify(payload), JSON.stringify(r.res), claim.id);
  await audit(user, 'ETIMS_REJECTED', 'etims_invoice', claim.id, { resultCd: r.res.resultCd ?? null });
  return 'FAILED';
}

/** Send everything due — after a sale, and from the ETIMS_SUBMIT job. */
export async function submitDue(user: Actor, limit = 25): Promise<{ signed: number; pending: number; failed: number }> {
  const out = { signed: 0, pending: 0, failed: 0 };
  if (!(await etimsEnabled())) return out;
  const due = await all<{ id: number }>(
    "SELECT id FROM etims_invoice WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id LIMIT ?", new Date().toISOString(), limit);
  for (const d of due) {
    const s = await submitInvoice(d.id, user);
    out[s === 'SIGNED' ? 'signed' : s === 'FAILED' ? 'failed' : 'pending']++;
  }
  return out;
}

/** Put a FAILED invoice back in the queue once its cause is fixed (it keeps its invoice number). */
export async function retryInvoice(id: number, user: Actor): Promise<void> {
  const done = await run("UPDATE etims_invoice SET status = 'PENDING', next_attempt_at = ? WHERE id = ? AND status = 'FAILED'", new Date().toISOString(), id);
  if (!done.changes) throw new AppError('Only a failed invoice can be retried', 'VALIDATION');
  await audit(user, 'ETIMS_RETRY', 'etims_invoice', id, {});
}

export const listEtimsInvoices = (status: 'all' | 'attention' = 'attention', limit = 200): Promise<EtimsInvoice[]> =>
  all<EtimsInvoice>(
    `SELECT * FROM etims_invoice ${status === 'attention' ? "WHERE status <> 'SIGNED'" : ''} ORDER BY id DESC LIMIT ?`, limit);

export const etimsFor = (sourceType: EtimsSourceType, sourceNo: string): Promise<EtimsInvoice | undefined> =>
  one<EtimsInvoice>('SELECT * FROM etims_invoice WHERE source_type = ? AND source_no = ? AND rcpt_type = ?', sourceType, sourceNo, sourceType === 'SALES_CREDIT_MEMO' ? 'R' : 'S');

/* ----------------------------------------------------------------- receipt */

/** KRA's verification link: PIN + branch + receipt signature. */
export function verificationUrl(env: EtimsEnvironment, tin: string, bhfId: string, rcptSign: string): string {
  return `${VERIFY_HOSTS[env]}/common/link/etims/receipt/indexEtimsReceiptData?Data=${encodeURIComponent(`${tin}${bhfId}${rcptSign}`)}`;
}

/** The eTIMS block for a printed receipt or invoice — signed details and QR, or why it is not signed yet. */
export async function etimsReceiptHtml(sourceType: EtimsSourceType, sourceNo: string): Promise<string | null> {
  const inv = await etimsFor(sourceType, sourceNo);
  if (!inv) return null;
  const v = ((await readIntegration('etims'))?.value ?? {}) as Record<string, unknown>;
  const env: EtimsEnvironment = v.environment === 'production' ? 'production' : 'sandbox';
  const tin = String(v.tin ?? '');
  const bhfId = String(v.bhfId ?? '00');
  if (inv.status !== 'SIGNED' || !inv.rcpt_sign) {
    return `<section class="dp-notes"><div class="dp-note"><div class="dp-note-h">KRA eTIMS</div>
      <div>${inv.status === 'FAILED' ? 'Not signed — KRA refused this invoice; finance is resolving it.' : 'Being signed by KRA — the signed copy can be reprinted shortly.'}</div></div></section>`;
  }
  const url = verificationUrl(env, tin, bhfId, inv.rcpt_sign);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 132, errorCorrectionLevel: 'M' });
  const sdc = inv.sdc_date_time && /^\d{14}$/.test(inv.sdc_date_time)
    ? `${inv.sdc_date_time.slice(6, 8)}/${inv.sdc_date_time.slice(4, 6)}/${inv.sdc_date_time.slice(0, 4)} ${inv.sdc_date_time.slice(8, 10)}:${inv.sdc_date_time.slice(10, 12)}:${inv.sdc_date_time.slice(12, 14)}`
    : inv.sdc_date_time ?? '';
  const row = (k: string, val: unknown) => `<tr><td style="padding:2px 10px 2px 0;color:#555">${esc(k)}</td><td style="padding:2px 0;font-family:monospace">${esc(val)}</td></tr>`;
  return `<section class="dp-notes" style="display:flex;gap:16px;align-items:flex-start;border:1px solid #ccc;padding:10px;margin-top:10px">
    <img src="${qr}" alt="KRA verification QR" width="132" height="132" />
    <div><div style="font-weight:700;margin-bottom:4px">KRA eTIMS — tax invoice${env === 'sandbox' ? ' (SANDBOX — not a valid tax invoice)' : ''}</div>
    <table style="border-collapse:collapse;font-size:11px">
      ${row('PIN', tin)}${row('Invoice No.', inv.invc_no)}${row('SCU ID', inv.sdc_id ?? '')}${row('CU Invoice No.', `${inv.sdc_id ?? ''}/${inv.tot_rcpt_no ?? inv.cur_rcpt_no ?? ''}`)}
      ${row('Receipt No.', `${inv.cur_rcpt_no ?? ''}/${inv.tot_rcpt_no ?? ''}`)}${row('Internal data', inv.intrl_data ?? '')}${row('Receipt signature', inv.rcpt_sign)}
      ${row('SCU date & time', sdc)}${inv.mrc_no ? row('MRC No.', inv.mrc_no) : ''}
    </table><div style="font-size:10px;color:#555;margin-top:4px">Scan to verify with KRA</div></div></section>`;
}

