import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { one, all, run, tx, audit } from './db.ts';
import { AppError } from './errors.ts';
import { readIntegration, writeIntegration, openSecret, nextSecret, sealSecret, randomToken } from './integrationSettings.ts';
import type { Actor, Cents } from './types.ts';

/*
 * M-Pesa — Safaricom Daraja "Lipa na M-Pesa Online" (STK push), set up under Admin Centre →
 * Integrations → M-Pesa.
 *
 * Finance sends a payment prompt to a client's phone from an open invoice (or the customer card);
 * Safaricom calls back with the outcome and a paid prompt posts as a client payment (Dr the M-Pesa
 * bank account / Cr the receivables control, applied to the invoice), keyed on the M-Pesa receipt
 * so it can never post twice. If the callback cannot get through, "Check status" asks Safaricom directly.
 *
 * Security:
 *  - The Daraja hosts follow from the environment chosen; an administrator cannot point the
 *    credentials (or a callback) at an arbitrary server.
 *  - The consumer secret, passkey and callback token are sealed at rest and never reach a browser.
 *  - Daraja does not sign callbacks, so each callback URL carries a random secret token, compared
 *    in constant time; MPESA_ALLOWED_IPS can further restrict callers to Safaricom's addresses.
 *  - A prompt resolves exactly once (row lock + PENDING check); an amount that differs from what
 *    was asked for is parked for review instead of posted.
 */

type MpesaEnvironment = 'sandbox' | 'production';
type MpesaTransactionType = 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
type MpesaStatus = 'PENDING' | 'POSTED' | 'PAID_UNPOSTED' | 'REVIEW' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

export const DARAJA_HOSTS: Record<MpesaEnvironment, string> = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

interface MpesaSettingsInput {
  enabled: boolean;
  environment: MpesaEnvironment;
  transactionType: MpesaTransactionType;
  shortCode: string;
  partyB: string;
  /** Public https:// address of this application; the callback path is appended to it. */
  publicBaseUrl: string;
  consumerKey: string;
  /** Blank keeps the stored secret. */
  consumerSecret: string;
  /** Blank keeps the stored passkey. */
  passKey: string;
  /** The bank / cash account code (Cash Management) that receives the M-Pesa money — e.g. MPESA. */
  paymentCode: string;
}

/** What the setup screen may see: never a secret, only whether one is stored. */
export interface MpesaSettingsInfo extends Omit<MpesaSettingsInput, 'consumerSecret' | 'passKey'> {
  hasSecret: boolean;
  hasPassKey: boolean;
  secretsUnreadable: boolean;
  /** The callback URL with its token masked — enough to recognise, not to forge. */
  callbackUrlMasked: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface MpesaConfig {
  environment: MpesaEnvironment;
  authUrl: string; stkUrl: string; queryUrl: string;
  transactionType: MpesaTransactionType;
  shortCode: string; partyB: string;
  callbackUrl: string;
  consumerKey: string; consumerSecret: string; passKey: string;
  paymentCode: string;
}

const BLANK: Omit<MpesaSettingsInfo, 'hasSecret' | 'hasPassKey' | 'secretsUnreadable' | 'callbackUrlMasked' | 'updatedAt' | 'updatedBy'> = {
  enabled: false, environment: 'sandbox', transactionType: 'CustomerPayBillOnline', shortCode: '', partyB: '',
  publicBaseUrl: '', consumerKey: '', paymentCode: 'MPESA',
};

const CALLBACK_PATH = '/api/mpesa/callback/';

function callbackUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}${CALLBACK_PATH}${token}`;
}

export async function getMpesaSettingsInfo(): Promise<MpesaSettingsInfo> {
  const row = await readIntegration('mpesa');
  if (!row) return { ...BLANK, hasSecret: false, hasPassKey: false, secretsUnreadable: false, callbackUrlMasked: null, updatedAt: null, updatedBy: null };
  const { secret_enc, passkey_enc, token_enc, ...rest } = row.value as Record<string, unknown>;
  const value = { ...BLANK, ...(rest as Partial<MpesaSettingsInput>) };
  const secret = openSecret(secret_enc); const pass = openSecret(passkey_enc); const token = openSecret(token_enc);
  return {
    ...value,
    hasSecret: Boolean(secret_enc), hasPassKey: Boolean(passkey_enc),
    secretsUnreadable: (Boolean(secret_enc) && !secret) || (Boolean(passkey_enc) && !pass) || (Boolean(token_enc) && !token),
    callbackUrlMasked: value.publicBaseUrl && token ? callbackUrl(value.publicBaseUrl, `${token.slice(0, 4)}…${token.slice(-4)}`) : null,
    updatedAt: row.updated_at, updatedBy: row.updated_by,
  };
}

function toConfig(v: MpesaSettingsInput, token: string): MpesaConfig {
  const host = DARAJA_HOSTS[v.environment];
  return {
    environment: v.environment,
    authUrl: `${host}/oauth/v1/generate?grant_type=client_credentials`,
    stkUrl: `${host}/mpesa/stkpush/v1/processrequest`,
    queryUrl: `${host}/mpesa/stkpushquery/v1/query`,
    transactionType: v.transactionType, shortCode: v.shortCode, partyB: v.partyB,
    callbackUrl: callbackUrl(v.publicBaseUrl, token),
    consumerKey: v.consumerKey, consumerSecret: v.consumerSecret, passKey: v.passKey, paymentCode: v.paymentCode,
  };
}

/** The live configuration when M-Pesa is set up and switched on, else null. */
async function getMpesaConfig(): Promise<MpesaConfig | null> {
  const row = await readIntegration('mpesa');
  if (!row) return null;
  const { secret_enc, passkey_enc, token_enc, ...rest } = row.value as Record<string, unknown>;
  const v = { ...BLANK, ...(rest as Partial<MpesaSettingsInput>) } as MpesaSettingsInput;
  const consumerSecret = openSecret(secret_enc); const passKey = openSecret(passkey_enc); const token = openSecret(token_enc);
  if (!v.enabled || !consumerSecret || !passKey || !token || !v.shortCode || !v.consumerKey || !v.publicBaseUrl) return null;
  return toConfig({ ...v, consumerSecret, passKey }, token);
}

/* ------------------------------------------------------------------ validation & saving */

const isPublicHttps = (raw: string): string | null => {
  let u: URL;
  try { u = new URL(raw); } catch { return 'Enter the full public address of this system, e.g. https://app.waysideclinic.co.ke'; }
  if (u.protocol !== 'https:') return 'Safaricom only calls back over https://';
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/i.test(u.hostname) || !u.hostname.includes('.')) {
    return 'Use a public address — Safaricom cannot reach a private or local one';
  }
  if (u.search || u.hash || u.username || u.password) return 'Enter just the address, without a query, fragment or credentials';
  return null;
};

/** Cleans and checks what the setup form sent. Throws a VALIDATION error naming the first problem. */
export function cleanMpesaInput(raw: Record<string, unknown>): MpesaSettingsInput {
  const s = (k: string) => String(raw[k] ?? '').trim();
  const v: MpesaSettingsInput = {
    enabled: raw.enabled === 1 || raw.enabled === '1' || raw.enabled === true || raw.enabled === 'on',
    environment: s('environment') === 'production' ? 'production' : 'sandbox',
    transactionType: s('transactionType') === 'CustomerBuyGoodsOnline' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
    shortCode: s('shortCode'), partyB: s('partyB'),
    publicBaseUrl: s('publicBaseUrl').replace(/\/+$/, ''),
    consumerKey: s('consumerKey'), consumerSecret: s('consumerSecret'), passKey: s('passKey'),
    paymentCode: s('paymentCode').toUpperCase() || 'MPESA',
  };
  const problem =
    (!/^\d{5,7}$/.test(v.shortCode) && 'Enter the paybill or till number (5–7 digits)') ||
    (v.partyB !== '' && !/^\d{5,7}$/.test(v.partyB) && 'Party B is 5–7 digits, or blank to use the short code') ||
    isPublicHttps(v.publicBaseUrl) ||
    (!/^[A-Za-z0-9]{10,100}$/.test(v.consumerKey) && 'Copy the consumer key from the Daraja app') ||
    (v.consumerSecret !== '' && !/^[A-Za-z0-9+/=]{10,200}$/.test(v.consumerSecret) && 'Copy the consumer secret from the Daraja app') ||
    (v.passKey !== '' && !/^[A-Za-z0-9]{20,200}$/.test(v.passKey) && 'Copy the Lipa na M-Pesa Online passkey') ||
    (!/^[A-Z0-9_-]{1,20}$/.test(v.paymentCode) && 'Pick the bank account M-Pesa receipts post to');
  if (problem) throw new AppError(problem, 'VALIDATION');
  return v;
}

export async function saveMpesaSettings(input: MpesaSettingsInput, user: Actor, opts: { rotateToken?: boolean } = {}): Promise<void> {
  const code = await one<{ code: string }>("SELECT code FROM bank_account WHERE code = ? AND status = 'ACTIVE'", input.paymentCode);
  if (!code) throw new AppError(`${input.paymentCode} is not an active bank / cash account (Cash Management → Bank Accounts)`, 'VALIDATION');
  const existing = (await readIntegration('mpesa'))?.value ?? {};
  const secret_enc = nextSecret(input.consumerSecret, existing.secret_enc);
  const passkey_enc = nextSecret(input.passKey, existing.passkey_enc);
  if (input.enabled && (!openSecret(secret_enc) || !openSecret(passkey_enc))) {
    throw new AppError('Enter the consumer secret and passkey before switching M-Pesa on', 'VALIDATION');
  }
  // The callback token is generated once and kept; rotating it invalidates any old callback URL.
  const token_enc = opts.rotateToken || !openSecret(existing.token_enc) ? sealSecret(randomToken()) : existing.token_enc;
  const { consumerSecret: _s, passKey: _p, ...plain } = input;
  await writeIntegration('mpesa', { ...plain, secret_enc, passkey_enc, token_enc }, user.username);
  await audit(user, 'MPESA_SETUP_SAVE', 'integration_setting', 'mpesa', {
    enabled: input.enabled, environment: input.environment, shortCode: input.shortCode, paymentCode: input.paymentCode,
    secretChanged: Boolean(input.consumerSecret), passKeyChanged: Boolean(input.passKey), tokenRotated: Boolean(opts.rotateToken),
  });
}

/* ------------------------------------------------------------------ Daraja calls */

type TokenResult = { ok: true; token: string } | { ok: false; error: string };

async function requestToken(c: Pick<MpesaConfig, 'authUrl' | 'consumerKey' | 'consumerSecret'>): Promise<TokenResult> {
  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64');
  try {
    const res = await fetch(c.authUrl, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    if (!res.ok) return { ok: false, error: res.status === 400 || res.status === 401 ? 'Safaricom rejected the consumer key or secret' : `Safaricom answered HTTP ${res.status}` };
    const token = ((await res.json()) as { access_token?: string }).access_token;
    return token ? { ok: true, token } : { ok: false, error: 'Safaricom returned no access token' };
  } catch {
    return { ok: false, error: 'Could not reach Safaricom (network error or timeout)' };
  }
}

/** "Test credentials": asks Safaricom for a token with the form's values (stored secret if blank). No prompt is sent, no money moves. */
export async function testMpesaCredentials(input: MpesaSettingsInput, user: Actor): Promise<string> {
  const existing = (await readIntegration('mpesa'))?.value ?? {};
  const consumerSecret = input.consumerSecret || openSecret(existing.secret_enc) || '';
  if (!consumerSecret) throw new AppError('Enter the consumer secret to test with', 'VALIDATION');
  const res = await requestToken({ authUrl: `${DARAJA_HOSTS[input.environment]}/oauth/v1/generate?grant_type=client_credentials`, consumerKey: input.consumerKey, consumerSecret });
  await audit(user, 'MPESA_SETUP_TEST', 'integration_setting', 'mpesa', { environment: input.environment, ok: res.ok });
  if (!res.ok) throw new AppError(res.error, 'MPESA');
  return `Safaricom accepted the consumer key and secret (${input.environment}). The passkey and short code are checked on the first real prompt.`;
}



/* ------------------------------------------------------------------ client invoice prompts */

interface MpesaRequestRow {
  id: number; customer_id: number; customer_no?: string | null; customer_name?: string | null; document_no: string | null;
  environment: MpesaEnvironment; phone: string; amount: Cents;
  account_reference: string; checkout_request_id: string | null; status: MpesaStatus; result_code: number | null;
  result_desc: string | null; mpesa_receipt: string | null; paid_amount: Cents | null; journal_no: string | null;
  requested_by: string; requested_at: string; completed_at: string | null;
}

/** The latest prompts across all clients — the setup screen's activity log, attention items first. */
export const listRecentMpesaRequests = (limit = 50): Promise<MpesaRequestRow[]> =>
  all<MpesaRequestRow>(
    `SELECT m.*, c.no AS customer_no, c.name AS customer_name FROM mpesa_request m JOIN customer c ON c.id = m.customer_id
     ORDER BY CASE WHEN m.status IN ('PAID_UNPOSTED', 'REVIEW') THEN 0 ELSE 1 END, m.id DESC LIMIT ?`, limit);

/** Masks a phone for display and logs: 2547••••5678. */
export const maskPhone = (p: string): string => (p.length > 7 ? `${p.slice(0, 4)}${'•'.repeat(p.length - 8)}${p.slice(-4)}` : p);


/**
 * A confirmed M-Pesa payment from a client: Dr the M-Pesa bank account / Cr the client's
 * receivables control, a customer ledger payment entry, applied to the invoice it was for
 * (or left on account). Idempotent on the M-Pesa reference.
 */
async function postClientPayment(r: MpesaRequestRow, bankCode: string, amount: Cents, reference: string): Promise<string> {
  const cust = await one<{ id: number; no: string; name: string; customer_posting_group_code: string | null }>(
    'SELECT id, no, name, customer_posting_group_code FROM customer WHERE id = ?', r.customer_id);
  if (!cust) throw new AppError('Client not found', 'NOT_FOUND');
  const pg = await one<{ receivables_account_id: number }>('SELECT receivables_account_id FROM customer_posting_group WHERE code = ?', cust.customer_posting_group_code);
  if (!pg) throw new AppError('The client has no customer posting group', 'VALIDATION');
  const bank = await one<{ gl_account_id: number }>('SELECT gl_account_id FROM bank_account WHERE code = ?', bankCode);
  if (!bank) throw new AppError(`Bank account ${bankCode} (M-Pesa) not found`, 'VALIDATION');
  const today = new Date().toISOString().slice(0, 10);
  const { postJournal } = await import('./accounting.ts');
  const ledger = await import('./custLedger.ts');
  const j = await postJournal({
    valueDate: today, module: 'RECEIVABLES', eventType: 'MPESA_PAYMENT', reference, user: SYSTEM,
    description: `M-Pesa ${reference} — ${cust.name}`, idempotencyKey: `MPESA-${r.checkout_request_id}`,
    lines: [
      { account: bank.gl_account_id, debit: amount, credit: 0, narration: `M-Pesa ${reference}`, bankDocumentType: 'Payment', bankDocumentNo: reference },
      { account: pg.receivables_account_id, debit: 0, credit: amount, narration: `${cust.no} payment` },
    ],
  });
  if (j.duplicate) return j.journal_no;
  const entryId = await ledger.createCustLedgerEntry({
    customerId: cust.id, postingDate: today, documentType: 'Payment', documentNo: reference,
    description: `M-Pesa payment${r.document_no ? ` for ${r.document_no}` : ''}`, amount: -amount, sourceType: 'M-Pesa', sourceId: r.id, journalId: j.id,
  });
  const target = r.document_no
    ? await one<{ id: number }>('SELECT id FROM cust_ledger_entry WHERE customer_id = ? AND document_no = ? AND open = 1 AND positive = 1 ORDER BY id LIMIT 1', cust.id, r.document_no)
    : undefined;
  const anyOpen = target ?? await one<{ id: number }>('SELECT id FROM cust_ledger_entry WHERE customer_id = ? AND open = 1 AND positive = 1 LIMIT 1', cust.id);
  if (anyOpen) await ledger.applyCustomerEntries({ applyingEntryId: entryId, appliedTo: target ? [target.id] : 'auto', postingDate: today }, SYSTEM);
  await ledger.recomputeCustomerBalance(cust.id);
  return j.journal_no;
}


const SYSTEM: Actor = { id: 0, username: 'M-PESA' };

/** What resolving a prompt did — `newlyPosted` is true only the one time the payment posted. */
interface MpesaOutcome { status: MpesaStatus; id: number; newlyPosted: boolean }

const statusForResult = (code: number): MpesaStatus => (code === 1032 ? 'CANCELLED' : code === 1037 ? 'TIMEOUT' : 'FAILED');

/**
 * Applies a final outcome to a PENDING prompt exactly once. A paid prompt posts a client payment;
 * a paid amount that differs from the request is parked as REVIEW, and a payment that cannot post
 * (a closed period, a missing account) is PAID_UNPOSTED — the money is real, so neither is lost or guessed at.
 */
async function resolveRequest(
  checkoutRequestId: string,
  outcome: { resultCode: number; resultDesc: string; receipt?: string | null; paidAmount?: Cents | null; paidPhone?: string | null; transactionDate?: string | null },
): Promise<MpesaOutcome | null> {
  return tx(async () => {
    const r = await one<MpesaRequestRow>('SELECT * FROM mpesa_request WHERE checkout_request_id = ? FOR UPDATE', checkoutRequestId);
    if (!r) return null;
    if (r.status !== 'PENDING') {
      // A late callback after "Check status" already posted: just record the receipt number.
      if (outcome.receipt && !r.mpesa_receipt) await run('UPDATE mpesa_request SET mpesa_receipt = ? WHERE id = ?', outcome.receipt, r.id);
      return { status: r.status, id: r.id, newlyPosted: false };
    }
    const now = new Date().toISOString();
    if (outcome.resultCode !== 0) {
      const status = statusForResult(outcome.resultCode);
      await run('UPDATE mpesa_request SET status = ?, result_code = ?, result_desc = ?, completed_at = ? WHERE id = ?',
        status, outcome.resultCode, outcome.resultDesc.slice(0, 200), now, r.id);
      return { status, id: r.id, newlyPosted: false };
    }
    const paid = outcome.paidAmount ?? Number(r.amount);
    let status: MpesaStatus = 'POSTED';
    let journalNo: string | null = null;
    if (paid !== Number(r.amount)) {
      status = 'REVIEW';
    } else {
      const c = await getMpesaConfig();
      const code = c?.paymentCode ?? String((await readIntegration('mpesa'))?.value.paymentCode ?? 'MPESA');
      try {
        const reference = outcome.receipt ?? r.checkout_request_id ?? `MPESA-${r.id}`;
        journalNo = await postClientPayment(r, code, paid, reference);
      } catch (err) {
        status = 'PAID_UNPOSTED';
        outcome.resultDesc = `Paid, but not posted: ${(err as Error).message}`.slice(0, 200);
      }
    }
    await run(
      `UPDATE mpesa_request SET status = ?, result_code = 0, result_desc = ?, mpesa_receipt = COALESCE(?, mpesa_receipt), paid_amount = ?,
         paid_phone = ?, transaction_date = ?, journal_no = ?, completed_at = ? WHERE id = ?`,
      status, outcome.resultDesc.slice(0, 200), outcome.receipt ?? null, paid, outcome.paidPhone ?? null, outcome.transactionDate ?? null,
      journalNo, now, r.id,
    );
    await audit(SYSTEM, 'MPESA_RESULT', 'mpesa_request', r.id, { status, receipt: outcome.receipt ?? null, amount: paid });
    return { status, id: r.id, newlyPosted: status === 'POSTED' };
  });
}

/** True when `token` is this system's current callback token (constant-time). */
export async function isValidCallbackToken(token: string): Promise<boolean> {
  const stored = openSecret((await readIntegration('mpesa'))?.value.token_enc);
  if (!stored || !token) return false;
  const a = Buffer.from(token); const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface CallbackBody {
  Body?: { stkCallback?: {
    MerchantRequestID?: string; CheckoutRequestID?: string; ResultCode?: number | string; ResultDesc?: string;
    CallbackMetadata?: { Item?: { Name?: string; Value?: unknown }[] };
  } };
}

/** Handles one Daraja STK callback body (already authenticated by its token). */
export async function handleMpesaCallback(body: unknown): Promise<MpesaOutcome | null> {
  const cb = (body as CallbackBody)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string' || cb.ResultCode === undefined) throw new AppError('Not an STK callback', 'VALIDATION');
  const items = new Map((cb.CallbackMetadata?.Item ?? []).map((i) => [String(i.Name), i.Value]));
  const amount = Number(items.get('Amount'));
  const receipt = items.get('MpesaReceiptNumber');
  return resolveRequest(cb.CheckoutRequestID, {
    resultCode: Number(cb.ResultCode),
    resultDesc: String(cb.ResultDesc ?? ''),
    receipt: typeof receipt === 'string' && /^[A-Z0-9]{8,20}$/.test(receipt) ? receipt : null,
    paidAmount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    paidPhone: items.get('PhoneNumber') != null ? String(items.get('PhoneNumber')).slice(0, 15) : null,
    transactionDate: items.get('TransactionDate') != null ? String(items.get('TransactionDate')).slice(0, 14) : null,
  });
}
