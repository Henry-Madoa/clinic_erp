/*
 * Security & penetration test suite.
 *
 *   pnpm test:security                         static + database checks
 *   BASE_URL=http://localhost:3000 pnpm test:security   …plus live HTTP probes against a running server
 *
 * Four layers, each answering "could an attacker, or a dishonest insider, get past this?":
 *
 *   1. Static     — every Server Action and page authorises before it reads or writes; the
 *                   permission catalogue only grants tables that exist; no raw HTML sinks.
 *   2. Crypto     — patient ID numbers and integration secrets are AES-256-GCM.
 *   3. Database   — the integrity rules live in Postgres, not just in the app: cashier receipts,
 *                   verified lab results and the audit log cannot be edited or deleted, bills must
 *                   balance, an M-Pesa code is receipted once. Plus role segregation of duties,
 *                   lab maker-checker, billing and claims integrity, PII masking and the
 *                   brute-force lockout.
 *   4. HTTP       — headers, unauthenticated access, IDOR-style probes, injection payloads,
 *                   the internal job endpoint (only when BASE_URL is set).
 *
 * Everything that writes runs inside a transaction that is always rolled back (see `sandbox`),
 * so the suite can run against the demo database without changing it. The lockout test is
 * the one exception: it writes failed-login counters on a demo account and restores them.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

process.env.SEED_DEMO_DATA ??= 'true';

const { all, one, run, tx } = await import('../lib/db.ts');
const { canAction } = await import('../lib/permissions.ts');
const permissions = await import('../lib/permissions.ts');
const auth = await import('../lib/auth.ts');
const crypto = await import('../lib/fieldCrypto.ts');
import type { ActionKey } from '../lib/permissions.ts';
import type { SessionUser } from '../lib/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');

let pass = 0;
let fail = 0;
let skip = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    if (err instanceof Skip) { skip++; console.log(`  - ${name} (skipped: ${err.message})`); return; }
    fail++;
    console.log(`  ✗ ${name}\n      ${(err as Error).message.split('\n').join('\n      ')}`);
  }
}
class Skip extends Error {}
const section = (title: string) => console.log(`\n${title}`);

/** Runs `fn` in a transaction that is always rolled back. */
const ROLLBACK = Symbol('rollback');
async function sandbox(fn: () => Promise<void>, timeout = 120_000): Promise<void> {
  try {
    await tx(async () => { await fn(); throw ROLLBACK; }, { timeout });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

/** Asserts `fn` rejects, optionally with a message or Postgres error matching `pattern`. */
async function rejects(fn: () => Promise<unknown>, pattern?: RegExp): Promise<void> {
  let threw: unknown = null;
  try { await fn(); } catch (err) { threw = err; }
  assert.ok(threw, 'expected the operation to be refused, but it succeeded');
  if (pattern) {
    const e = threw as { message?: string; code?: string; meta?: unknown };
    const text = `${e.message ?? ''} ${e.code ?? ''} ${JSON.stringify(e.meta ?? '')}`;
    assert.match(text, pattern);
  }
}

/** A statement that must fail at the database. Runs in its own rolled-back transaction because
 *  a failed statement aborts the transaction it is in. */
async function dbRefuses(sql: string, params: unknown[], pattern: RegExp): Promise<void> {
  await sandbox(() => rejects(() => run(sql, ...params), pattern));
}

const users = new Map<string, SessionUser>();
async function as(username: string): Promise<SessionUser> {
  const cached = users.get(username);
  if (cached) return cached;
  const row = await one<{ id: number }>('SELECT id FROM app_user WHERE username = ?', username);
  if (!row) throw new Skip(`demo user "${username}" not seeded`);
  const u = await auth.sessionUserById(row.id);
  assert.ok(u, `could not load session for ${username}`);
  users.set(username, u);
  return u;
}

/* ============================================================================ 1. STATIC */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

/** Exported async functions of a file, with their bodies (brace-matched, string/comment aware). */
function exportedFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Skip the parameter list (it may contain object-type braces), then match the body.
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth) { if (src[i] === '(') depth++; else if (src[i] === ')') depth--; i++; }
    // Return-type annotations can contain braces too: the body is the first `{` followed by a
    // newline or a statement after `)`, skipping `: Promise<{ … }>`.
    let angle = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '<') angle++; else if (c === '>') angle--;
      else if (c === '{' && angle === 0) break;
      i++;
    }
    const start = i;
    depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
      if (c === "'" || c === '"' || c === '`') {
        const q = c;
        for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    out.push({ name: m[1], body: src.slice(start, i + 1) });
  }
  return out;
}

const GUARD = /\b(requireAction|requireAnyAction|requireUser|requirePage|requireTable|getCurrentUser|currentCanAction|currentCanAnyAction|requireAdmin|requireSuper)\s*\(/;
/** Server Actions that are deliberately reachable without a session. */
const PUBLIC_ACTIONS = new Set(['signIn', 'signOut', 'verifyTwoFactor', 'completeTwoFactor', 'submitTwoFactor', 'switchCompany']);

section('1. Static — authorisation coverage');

await test('every Server Action authorises (or delegates to one that does)', () => {
  const files = walk(path.join(ROOT, 'app')).filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /^\s*['"]use server['"]/.test(fs.readFileSync(f, 'utf8')));
  assert.ok(files.length > 10, 'expected to find the Server Action modules');
  const unguarded: string[] = [];
  for (const f of files) {
    const fns = exportedFunctions(fs.readFileSync(f, 'utf8'));
    const guarded = new Set(fns.filter((x) => GUARD.test(x.body)).map((x) => x.name));
    // A thin wrapper is guarded if it calls a guarded action of the same module.
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of fns) {
        if (guarded.has(x.name)) continue;
        if ([...guarded].some((g) => new RegExp(`\\b${g}\\s*\\(`).test(x.body))) { guarded.add(x.name); grew = true; }
      }
    }
    for (const x of fns) if (!guarded.has(x.name) && !PUBLIC_ACTIONS.has(x.name)) unguarded.push(`${rel(f)}: ${x.name}`);
  }
  assert.deepStrictEqual(unguarded, [], `Server Actions with no authorisation check:\n${unguarded.join('\n')}`);
});

/** Pages that render without a session by design. */
const PUBLIC_PAGES = new Set(['app/login/page.tsx', 'app/not-found.tsx', 'app/page.tsx']);

await test('every page authorises before it loads data', () => {
  const pages = walk(path.join(ROOT, 'app')).filter((f) => /[\\/]page\.tsx$/.test(f));
  const unguarded = pages.map(rel).filter((p) => !PUBLIC_PAGES.has(p))
    .filter((p) => {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      // A page that only redirects elsewhere (and imports no data layer) exposes nothing itself.
      const redirectOnly = /\bredirect\(/.test(src) && !/from '@\/lib\//.test(src);
      return !GUARD.test(src) && !redirectOnly;
    });
  assert.deepStrictEqual(unguarded, [], `Pages with no authorisation check:\n${unguarded.join('\n')}`);
});

await test('every API route authorises (session action, or the internal token)', () => {
  const routes = walk(path.join(ROOT, 'app', 'api')).filter((f) => /route\.ts$/.test(f));
  const open = routes.map(rel).filter((p) => !p.endsWith('api/health/route.ts')).filter((p) => {
    const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
    return !(GUARD.test(src) || /excelExportResponse\('/.test(src) || /timingSafeEqual/.test(src) || /isValidCallbackToken\(/.test(src));
  });
  assert.deepStrictEqual(open, [], `API routes with no authorisation:\n${open.join('\n')}`);
});

await test('the permission catalogue only grants tables that exist', () => {
  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const models = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));
  const missing = new Set<string>();
  for (const [key, a] of Object.entries(permissions.ACTIONS)) {
    for (const [table] of a.tables) if (!models.has(table)) missing.add(`${key} → ${table}`);
  }
  assert.deepStrictEqual([...missing], []);
});

await test('every action points at a page that exists', () => {
  const pages = new Set(permissions.PAGES.map((p) => p.code));
  const bad = Object.entries(permissions.ACTIONS).filter(([, a]) => !pages.has(a.page)).map(([k, a]) => `${k} → ${a.page}`);
  assert.deepStrictEqual(bad, []);
});

await test('no dangerouslySetInnerHTML outside the vetted print/theme renderers', () => {
  const allowed = /(print|theme|layout)/i;
  const hits = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]
    .filter((f) => /\.tsx$/.test(f) && fs.readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'))
    .map(rel).filter((p) => !allowed.test(p));
  assert.deepStrictEqual(hits, [], 'raw HTML sinks are XSS vectors — render text, or justify and allowlist');
});

await test('no SQL is built by concatenating request input', () => {
  // Interpolation inside SQL template strings is fine for constants (column lists, SELECT_X
  // fragments); what must never appear is a FormData/searchParams value spliced straight in.
  const offenders: string[] = [];
  for (const f of walk(path.join(ROOT, 'lib')).filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:all|one|run)(?:<[^>]*>)?\(\s*`([^`]*)`/g)) {
      if (/\$\{\s*(?:v|i|input|form|formData|params|searchParams|query|search|q)\s*[.[]/.test(m[1])) offenders.push(`${rel(f)}: ${m[1].slice(0, 80)}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});

await test('the sign-in page advertises no accounts or password hints', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', 'login', 'login-form.tsx'), 'utf8') + fs.readFileSync(path.join(ROOT, 'app', 'login', 'page.tsx'), 'utf8');
  assert.doesNotMatch(src, /DEMO_USERS|demo-users|\$\{username\}123|admin123/, 'a public page must not list usernames or prefill passwords');
});

await test('sensitive capabilities are not implied by everyday rights', () => {
  // Each must need a permission object that no everyday action grants, or holding the everyday
  // action silently grants the sensitive one (the bug the CAP_* objects fixed).
  const sensitive = ['PATIENTS_PII_VIEW', 'CASHIER_DISCOUNT', 'CASHIER_VOID', 'LAB_VERIFY', 'CLINIC_PRICES_MANAGE', 'STOCK_COUNT_POST'] as const;
  for (const key of sensitive) {
    const page = permissions.ACTIONS[key].page;
    const sharers = Object.entries(permissions.ACTIONS).filter(([k, a]) => k !== key && a.page === page).map(([k]) => k);
    assert.deepStrictEqual(sharers, [], `${key} shares its permission object ${page} with ${sharers.join(', ')}`);
    assert.ok(!permissions.PAGES.find((p) => p.code === page)?.parent, `${page} must be top-level so granting a module never grants it`);
  }
});

section('1b. Static — HTTP hardening configuration');

await test('security headers are configured for every route', async () => {
  const cfg = (await import('../next.config.ts')).default as { headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>; poweredByHeader?: boolean; logging?: { serverFunctions?: boolean } };
  assert.strictEqual(cfg.poweredByHeader, false, 'X-Powered-By must be off');
  assert.strictEqual(cfg.logging?.serverFunctions, false, 'Server Function arguments (passwords, secrets) must not be logged');
  const rules = await cfg.headers!();
  const all = rules.find((r) => r.source === '/(.*)' || r.source === '/:path*');
  assert.ok(all, 'expected a catch-all header rule');
  const h = Object.fromEntries(all.headers.map((x) => [x.key.toLowerCase(), x.value]));
  assert.match(h['content-security-policy'] ?? '', /frame-ancestors 'none'/);
  assert.match(h['content-security-policy'] ?? '', /object-src 'none'/);
  assert.match(h['content-security-policy'] ?? '', /base-uri 'self'/);
  assert.match(h['content-security-policy'] ?? '', /form-action 'self'/);
  assert.strictEqual(h['x-content-type-options'], 'nosniff');
  assert.strictEqual(h['x-frame-options'], 'DENY');
  assert.ok(h['strict-transport-security'], 'HSTS header missing');
  assert.ok(h['referrer-policy'], 'Referrer-Policy missing');
});

await test('session cookies are httpOnly, SameSite and Secure in production', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'auth.ts'), 'utf8') + fs.readFileSync(path.join(ROOT, 'app', 'actions', 'auth.ts'), 'utf8');
  assert.match(src, /httpOnly:\s*true/);
  assert.match(src, /sameSite:\s*'(lax|strict)'/);
  assert.match(src, /secure:\s*(process\.env\.NODE_ENV\s*===\s*'production'|true|isProd|secureCookies)/);
});

await test('uploads refuse SVG and unknown kinds', async () => {
  const cl = await import('../lib/cloudinary.ts');
  assert.strictEqual(cl.isUploadKind('logo'), true);
  assert.strictEqual(cl.isUploadKind('../../etc/passwd'), false);
  assert.strictEqual(cl.isUploadKind('__proto__'), false);
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'cloudinary.ts'), 'utf8');
  const accepted = src.slice(src.indexOf('const ACCEPTED'), src.indexOf('};', src.indexOf('const ACCEPTED')));
  assert.ok(accepted.length > 20, 'could not find the ACCEPTED upload table');
  assert.doesNotMatch(accepted, /'svg'|image\/svg/i, 'SVG can carry script — it must not be an accepted upload type');
});

/* ============================================================================ 2. CRYPTO */

section('2. Field encryption (ID numbers and secrets)');

await test('round-trips and never stores plaintext', () => {
  const enc = crypto.encryptField('A1234567')!;
  assert.ok(enc.startsWith('v1:'));
  assert.ok(!enc.includes('A1234567'));
  assert.strictEqual(crypto.decryptField(enc), 'A1234567');
});

await test('uses a fresh IV — equal plaintexts encrypt differently', () => {
  assert.notStrictEqual(crypto.encryptField('29384756'), crypto.encryptField('29384756'));
});

await test('detects tampering (GCM auth tag)', () => {
  const enc = crypto.encryptField('29384756')!;
  const raw = Buffer.from(enc.slice(3), 'base64');
  raw[raw.length - 1] ^= 0x01;
  const forged = `v1:${raw.toString('base64')}`;
  let out: string | null | undefined;
  try { out = crypto.decryptField(forged); } catch { out = undefined; }
  assert.notStrictEqual(out, '29384756', 'a tampered ciphertext must not decrypt to the original');
});

await test('masks all but the last four characters', () => {
  const m = crypto.maskTail('4567')!;
  assert.ok(m.endsWith('4567') && !/\d{5,}/.test(m));
});

/* ============================================================================ 3. DATABASE */

section('3a. Database-enforced integrity (bypasses the app on purpose)');

const anyReceipt = await one<{ id: number }>("SELECT id FROM patient_payment WHERE status = 'POSTED' ORDER BY id LIMIT 1");
await test('cashier receipts cannot be edited', async () => {
  if (!anyReceipt) throw new Skip('no receipts seeded');
  await dbRefuses('UPDATE patient_payment SET amount = amount + 100 WHERE id = ?', [anyReceipt.id], /immutable|cannot|P0001/i);
  await dbRefuses("UPDATE patient_payment SET method = 'CARD' WHERE id = ?", [anyReceipt.id], /immutable|cannot|P0001/i);
});
await test('cashier receipts cannot be deleted', async () => {
  if (!anyReceipt) throw new Skip('no receipts seeded');
  await dbRefuses('DELETE FROM patient_payment WHERE id = ?', [anyReceipt.id], /cannot|void|P0001/i);
});

const anyAudit = await one<{ id: number }>('SELECT id FROM audit_log ORDER BY id LIMIT 1');
await test('the audit trail is append-only (no UPDATE)', async () => {
  if (!anyAudit) throw new Skip('audit log empty');
  await dbRefuses("UPDATE audit_log SET action = 'TAMPERED' WHERE id = ?", [anyAudit.id], /append|not allowed|cannot|P0001/i);
});
await test('the audit trail is append-only (no DELETE)', async () => {
  if (!anyAudit) throw new Skip('audit log empty');
  await dbRefuses('DELETE FROM audit_log WHERE id = ?', [anyAudit.id], /append|not allowed|cannot|P0001/i);
});

await test('journal lines cannot carry a negative or two-sided amount', async () => {
  const jl = await one<{ id: number }>('SELECT id FROM journal_line ORDER BY id LIMIT 1');
  if (!jl) throw new Skip('no journals');
  await dbRefuses('UPDATE journal_line SET debit = -100, credit = 0 WHERE id = ?', [jl.id], /check|23514/i);
  await dbRefuses('UPDATE journal_line SET debit = 100, credit = 100 WHERE id = ?', [jl.id], /check|23514/i);
});

await test('a verified lab result can never change, and no one verifies their own result', async () => {
  const r = await one<{ id: number; order_test_id: number; resulted_by: string }>(
    "SELECT r.id, r.order_test_id, t.resulted_by FROM lab_result r JOIN lab_order_test t ON t.id = r.order_test_id WHERE t.status = 'VERIFIED' ORDER BY r.id LIMIT 1");
  if (!r) throw new Skip('no verified results');
  await dbRefuses("UPDATE lab_result SET value_text = 'tampered' WHERE id = ?", [r.id], /verified|cannot|P0001/i);
  await dbRefuses('DELETE FROM lab_result WHERE id = ?', [r.id], /verified|cannot|P0001/i);
  await dbRefuses('UPDATE lab_order_test SET verified_by = resulted_by WHERE id = ?', [r.order_test_id], /check|23514/i);
});

await test('a bill must balance: net = gross − discount = patient share + scheme share', async () => {
  const b = await one<{ id: number }>("SELECT id FROM patient_bill WHERE status = 'FINAL' ORDER BY id LIMIT 1");
  if (!b) throw new Skip('no final bills');
  await dbRefuses('UPDATE patient_bill SET patient_share = patient_share + 100 WHERE id = ?', [b.id], /check|23514/i);
  await dbRefuses('UPDATE patient_bill SET discount = gross + 1, net = -1 WHERE id = ?', [b.id], /check|23514/i);
});

await test('a patient has at most one open visit, and a claim cannot approve more than it claimed', async () => {
  const v = await one<{ patient_id: number }>("SELECT patient_id FROM visit WHERE status = 'OPEN' ORDER BY id LIMIT 1");
  if (v) {
    await dbRefuses(
      "INSERT INTO visit (no, patient_id, visit_date, check_in_at, department_code, price_list_code, created_at, created_by) VALUES ('X-OPEN', ?, '2026-01-01', 'x', 'OPD', 'CASH', 'x', 'x')",
      [v.patient_id], /unique|23505/i);
  }
  const c = await one<{ id: number }>('SELECT id FROM insurance_claim ORDER BY id LIMIT 1');
  if (c) await dbRefuses('UPDATE insurance_claim SET approved_amount = amount + 1 WHERE id = ?', [c.id], /check|23514/i);
  if (!v && !c) throw new Skip('no open visits or claims');
});

await test('an M-Pesa code can be receipted only once', async () => {
  const p = await one<{ patient_id: number; visit_id: number; reference: string; bank_account_id: number }>(
    "SELECT patient_id, visit_id, reference, bank_account_id FROM patient_payment WHERE method = 'MPESA' AND status = 'POSTED' ORDER BY id LIMIT 1");
  if (!p) throw new Skip('no M-Pesa receipts');
  await dbRefuses(
    "INSERT INTO patient_payment (no, patient_id, visit_id, payment_date, method, reference, amount, bank_account_id, received_by, created_at) VALUES ('X-DUP', ?, ?, '2026-01-01', 'MPESA', ?, 100, ?, 'x', 'x')",
    [p.patient_id, p.visit_id, p.reference.toLowerCase(), p.bank_account_id], /unique|23505/i);
});

await test('every constraint the migrations declare exists in the database (no drift)', async () => {
  // A migration generated by diffing the live database once dropped the hand-written integrity
  // keys; this catches that class of mistake on the next run.
  const dir = path.join(ROOT, 'prisma', 'migrations');
  const expected = new Set<string>();
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    for (const line of fs.readFileSync(path.join(dir, m, 'migration.sql'), 'utf8').split('\n')) {
      const add = line.match(/ADD CONSTRAINT "([^"]+)" (FOREIGN KEY|CHECK|EXCLUDE)/);
      if (add) expected.add(add[1]);
      const drop = line.match(/DROP CONSTRAINT "([^"]+)"/);
      if (drop) expected.delete(drop[1]);
      // A renamed table renames its keys too (e.g. fosa_transaction → cash_office_transfer).
      const rename = line.match(/RENAME CONSTRAINT "([^"]+)" TO "([^"]+)"/);
      if (rename && expected.delete(rename[1])) expected.add(rename[2]);
    }
  }
  const have = new Set((await all<{ conname: string }>(
    "SELECT conname FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = current_schema() AND contype IN ('f','c','x')",
  )).map((r) => r.conname));
  const missing = [...expected].filter((c) => !have.has(c));
  assert.deepStrictEqual(missing, [], `constraints missing from the database: ${missing.join(', ')}`);
});

section('3b. Role segregation of duties (seeded permission sets)');

const MUST_NOT: [user: string, actions: ActionKey[]][] = [
  ['reception', ['CONSULTATION_WORK', 'LAB_WORK', 'PHARMACY_DISPENSE', 'CASHIER_DISCOUNT', 'CASHIER_VOID', 'GL_READ', 'PAYROLL_READ', 'PATIENTS_PII_VIEW', 'CLINIC_PRICES_MANAGE']],
  ['nurse', ['CONSULTATION_WORK', 'PHARMACY_DISPENSE', 'CASHIER_RECEIVE', 'CLAIMS_MANAGE', 'GL_READ']],
  ['lab', ['CONSULTATION_WORK', 'PHARMACY_DISPENSE', 'CASHIER_RECEIVE', 'CASHIER_DISCOUNT', 'CLINIC_PRICES_MANAGE', 'GL_READ']],
  ['pharmacist', ['CONSULTATION_WORK', 'LAB_VERIFY', 'CASHIER_DISCOUNT', 'CASHIER_VOID', 'CLINIC_PRICES_MANAGE', 'GL_READ']],
  ['cashier', ['CASHIER_DISCOUNT', 'CASHIER_VOID', 'CONSULTATION_WORK', 'CLINIC_PRICES_MANAGE', 'CLAIMS_MANAGE', 'GL_JOURNAL_CREATE', 'PATIENTS_PII_VIEW']],
  ['doctor', ['CASHIER_RECEIVE', 'CASHIER_DISCOUNT', 'CLINIC_PRICES_MANAGE', 'PHARMACY_DISPENSE', 'LAB_VERIFY', 'GL_READ', 'PAYROLL_READ']],
  ['hr', ['GL_READ', 'CONSULTATION_WORK', 'PATIENTS_READ', 'PATIENTS_PII_VIEW']],
  ['finance', ['CONSULTATION_WORK', 'PATIENTS_PII_VIEW', 'CLINIC_PRICES_MANAGE', 'CASHIER_VOID']],
];
for (const [username, keys] of MUST_NOT) {
  await test(`${username} cannot ${keys.join(', ')}`, async () => {
    const u = await as(username);
    const leaked = keys.filter((k) => k in permissions.ACTIONS && canAction(u, k));
    assert.deepStrictEqual(leaked, []);
  });
}

await test('the internal auditor is read-only', async () => {
  const u = await as('auditor');
  const writes = Object.keys(permissions.ACTIONS).filter((k) => /_(CREATE|MANAGE|POST|VOID|APPROVE|RUN|SETTLE|ADJUST|DELETE|EDIT|CANCEL|UPDATE|REQUEST|WORK|RECORD|DISPENSE|RECEIVE|BILL|DISCOUNT|VERIFY|CHECK_IN)(_|$)/.test(k))
    .filter((k) => canAction(u, k as ActionKey));
  assert.deepStrictEqual(writes, [], 'an auditor who can change what they audit is not independent');
});

await test('each role can do its own job (sanity — the matrix is not just "deny all")', async () => {
  const jobs: [string, ActionKey[]][] = [
    ['reception', ['PATIENTS_MANAGE', 'APPOINTMENTS_MANAGE', 'VISITS_CHECK_IN', 'QUEUES_WORK']],
    ['nurse', ['TRIAGE_RECORD', 'PROCEDURES_WORK']],
    ['doctor', ['CONSULTATION_WORK', 'TRIAGE_RECORD']],
    ['dentist', ['DENTAL_WORK', 'CONSULTATION_WORK']],
    ['lab', ['LAB_WORK', 'LAB_VERIFY']],
    ['pharmacist', ['PHARMACY_DISPENSE']],
    ['cashier', ['CASHIER_BILL', 'CASHIER_RECEIVE']],
    ['claims', ['CLAIMS_MANAGE']],
    ['finance', ['RECEIVABLES_SALES_POST', 'GL_JOURNAL_CREATE']],
    ['director', ['CASHIER_DISCOUNT', 'CLINIC_PRICES_MANAGE', 'PATIENTS_PII_VIEW', 'LAB_VERIFY']],
  ];
  for (const [u, keys] of jobs) {
    const user = await as(u);
    for (const k of keys) assert.ok(canAction(user, k), `${u} should be able to ${k}`);
  }
});

section('3c. Business-logic abuse (rolled back)');

const labLib = await import('../lib/clinic/lab.ts');
const billingLib = await import('../lib/clinic/billing.ts');
const claimsLib = await import('../lib/clinic/claims.ts');
const patientsLib = await import('../lib/clinic/patients.ts');
const SYS = { id: 1, username: 'security-test' };

await test('a lab result is never verified by the person who entered it', async () => {
  const t = await one<{ id: number; resulted_by: string }>("SELECT id, resulted_by FROM lab_order_test WHERE status = 'RESULTED' ORDER BY id LIMIT 1");
  if (!t?.resulted_by) throw new Skip('no resulted, unverified test');
  const u = await one<{ id: number }>('SELECT id FROM app_user WHERE username = ?', t.resulted_by);
  await sandbox(async () => {
    await rejects(() => labLib.verifyResults([t.id], { id: u?.id ?? 0, username: t.resulted_by }), /second person|entered this result/i);
  });
});

await test('a final bill takes no more charges, and a receipt cannot exceed what is owed', async () => {
  const b = await one<{ visit_id: number; no: string }>(
    "SELECT b.visit_id, v.no FROM patient_bill b JOIN visit v ON v.id = b.visit_id WHERE b.status = 'FINAL' ORDER BY b.id LIMIT 1");
  if (!b) throw new Skip('no final bill');
  const svc = await one<{ id: number }>("SELECT id FROM service_item WHERE kind = 'PROCEDURE' AND status = 'ACTIVE' LIMIT 1");
  await sandbox(async () => {
    await rejects(() => billingLib.addCharge(b.visit_id, { serviceItemId: svc!.id, sourceType: 'MANUAL' }, SYS), /final/i);
    const acc = await billingLib.visitAccount(b.visit_id);
    await rejects(() => billingLib.receivePayment(b.no, { method: 'CARD', amount: String(acc.balance / 100 + 1000) }, SYS), /owed|nothing is owed/i);
  });
});

await test('a decided claim cannot be decided again, and a partial approval must be less than the claim', async () => {
  const c = await one<{ no: string; status: string; amount: number }>("SELECT no, status, amount FROM insurance_claim ORDER BY id LIMIT 1");
  if (!c) throw new Skip('no claims');
  await sandbox(async () => {
    if (['APPROVED', 'PARTIAL', 'REJECTED'].includes(c.status)) {
      await rejects(() => claimsLib.decideClaim(c.no, { decision: 'APPROVED' }, SYS), /already been decided/i);
    } else {
      await rejects(() => claimsLib.decideClaim(c.no, { decision: 'PARTIAL', approved_amount: String(Number(c.amount) / 100 + 1) }, SYS), /cannot exceed/i);
    }
  });
});

await test('sales invoices to payers are VAT-exempt and the receivable equals the claim approved', async () => {
  const c = await one<{ invoice_no: string; approved_amount: number }>("SELECT invoice_no, approved_amount FROM insurance_claim WHERE invoice_no IS NOT NULL ORDER BY id LIMIT 1");
  if (!c) throw new Skip('no invoiced claims');
  const d = await one<{ amount: number; vat_amount: number }>('SELECT amount, vat_amount FROM posted_sales_document WHERE no = ?', c.invoice_no);
  assert.strictEqual(Number(d?.vat_amount), 0, 'medical services are exempt');
  assert.strictEqual(Number(d?.amount), Number(c.approved_amount));
});

section('3d. Personal data — patient ID numbers');

await test('patient lists never carry the raw or encrypted ID number', async () => {
  await sandbox(async () => {
    await patientsLib.registerPatient({ first_name: 'Test', last_name: 'Patient', sex: 'FEMALE', id_number: '12345678', confirm_not_duplicate: 1 }, SYS);
    const rows = JSON.stringify(await patientsLib.listPatients('Test Patient'));
    assert.ok(!rows.includes('12345678'), 'the ID number reaches the list');
    const stored = await one<{ id_number_enc: string }>("SELECT id_number_enc FROM patient WHERE first_name = 'Test' AND last_name = 'Patient'");
    assert.ok(stored?.id_number_enc && !stored.id_number_enc.includes('12345678'), 'stored in clear');
  });
});

await test('revealing a patient ID number needs its own capability and is audited', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', 'actions', 'clinic.ts'), 'utf8');
  assert.match(src, /revealIdNumber\(mrn, await requireAction\('PATIENTS_PII_VIEW'\)\)/);
  const lib = fs.readFileSync(path.join(ROOT, 'lib', 'clinic', 'patients.ts'), 'utf8');
  const body = lib.slice(lib.indexOf('export async function revealIdNumber'), lib.indexOf('/* ------------------------------------------------------------------ covers'));
  assert.match(body, /audit\(/);
});

await test('patient search treats SQL metacharacters as text', async () => {
  const rows = await patientsLib.listPatients("' OR '1'='1");
  assert.deepStrictEqual(rows, []);
  assert.ok(Array.isArray(await patientsLib.listPatients('%')));
});

await test('configuration packages can never target the ledgers, health records or secrets', async () => {
  const offered = new Set((await (await import('../lib/configPackages.ts')).listConfigPackageTables()).map((t) => t.table_name));
  const forbidden = [
    'journal', 'journal_line', 'audit_log', 'app_user', 'session', 'cust_ledger_entry', 'vendor_ledger_entry', 'bank_account_ledger_entry',
    'patient_bill', 'patient_payment', 'patient_charge', 'insurance_claim', 'lab_result', 'patient', 'consultation', 'diagnosis',
    'posted_sales_document', 'posted_sales_line', 'etims_invoice', 'mpesa_request', 'integration_setting',
  ];
  assert.deepStrictEqual(forbidden.filter((t) => offered.has(t)), []);
  assert.ok(offered.has('customer') && offered.has('service_item'), 'ordinary master data is still offered');
});

section('3e. Authentication');

await test('passwords are salted and slow-hashed, never stored in clear', async () => {
  const rows = await all<{ password_hash: string }>('SELECT password_hash FROM app_user LIMIT 5');
  for (const r of rows) assert.ok(r.password_hash.length >= 40 && !/^[a-z]+\d*$/i.test(r.password_hash));
  const h1 = auth.hashPassword('Correct-Horse-1');
  const h2 = auth.hashPassword('Correct-Horse-1');
  assert.notStrictEqual(h1, h2, 'equal passwords must hash differently (salt)');
  assert.ok(auth.verifyPassword('Correct-Horse-1', h1));
  assert.ok(!auth.verifyPassword('correct-horse-1', h1));
});

await test('unknown users and wrong passwords look the same (no user enumeration)', async () => {
  const u = await one<{ id: number; failed_logins: number; locked_until: string | null }>("SELECT id, failed_logins, locked_until FROM app_user WHERE username = 'auditor'");
  if (!u) throw new Skip('no auditor account');
  try {
    // Start unlocked, or the refusal would be the lock, not the password.
    await run('UPDATE app_user SET failed_logins = 0, locked_until = NULL WHERE id = ?', u.id);
    const a = await auth.login('no-such-user-' + Date.now(), 'whatever');
    const b = await auth.login('auditor', 'definitely-wrong-' + Date.now());
    assert.strictEqual(a, null);
    assert.strictEqual(b, null);
  } finally {
    // The wrong password counted against the demo account — put it back.
    await run('UPDATE app_user SET failed_logins = ?, locked_until = ? WHERE id = ?', u.failed_logins, u.locked_until, u.id);
  }
});

await test('five wrong passwords lock the account', async () => {
  const u = await one<{ id: number; failed_logins: number; locked_until: string | null }>("SELECT id, failed_logins, locked_until FROM app_user WHERE username = 'auditor'");
  if (!u) throw new Skip('no auditor account');
  try {
    let refusedAsLocked = false;
    for (let i = 0; i < 6; i++) {
      try { await auth.login('auditor', `wrong-${i}-${Date.now()}`); } catch (err) {
        if (/too many|locked/i.test((err as Error).message)) refusedAsLocked = true; else throw err;
      }
    }
    assert.ok(refusedAsLocked, 'the sixth attempt should be refused as locked, not checked against the password');
    const after = await one<{ failed_logins: number; locked_until: string | null }>('SELECT failed_logins, locked_until FROM app_user WHERE id = ?', u.id);
    assert.ok(after?.locked_until && after.locked_until > new Date().toISOString(), 'the account should be locked');
  } finally {
    await run('UPDATE app_user SET failed_logins = ?, locked_until = ? WHERE id = ?', u.failed_logins, u.locked_until, u.id);
  }
});

await test('a forged or expired session token is refused', async () => {
  assert.strictEqual(await auth.userFromToken('x'.repeat(64)), null);
  assert.strictEqual(await auth.userFromToken("' OR 1=1 --"), null);
  assert.strictEqual(await auth.userFromToken(undefined), null);
});

section('3f. Integrations — M-Pesa and e-mail');

const mpesa = await import('../lib/mpesa.ts');
const mailSettings = await import('../lib/mailSettings.ts');
const { approvalDecidedEmail } = await import('../lib/mailer.ts');
const FAKE = { secret: 'SeCrEtVaLuE0123456789', pass: 'PaSsKeY0123456789abcdefABCDEF', app: 'abcdefghijklmnop' };

await test('integration secrets are sealed at rest and never in the screen view', async () => {
  const admin = { id: 0, username: 'security-test' };
  await sandbox(async () => {
    await mpesa.saveMpesaSettings(mpesa.cleanMpesaInput({
      environment: 'sandbox', transactionType: 'CustomerPayBillOnline', shortCode: '174379', publicBaseUrl: 'https://erp.example.co.ke',
      consumerKey: 'AbCdEf0123456789', consumerSecret: FAKE.secret, passKey: FAKE.pass, paymentCode: 'MPESA', enabled: 1,
    }), admin);
    await mailSettings.saveMailSettings(mailSettings.cleanMailInput({ provider: 'gmail', fromAddress: 'finance@example.com', secret: FAKE.app, enabled: 1 }), admin);
    const raw = JSON.stringify(await all('SELECT value FROM integration_setting'));
    for (const s of Object.values(FAKE)) assert.ok(!raw.includes(s), 'a secret is stored in clear');
    const views = JSON.stringify([await mpesa.getMpesaSettingsInfo(), await mailSettings.getMailSettingsInfo()]);
    for (const s of Object.values(FAKE)) assert.ok(!views.includes(s), 'a secret reaches the setup screen');
    assert.ok(!/secret_enc|passkey_enc|token_enc/.test(views), 'sealed values reach the setup screen');
    const info = await mpesa.getMpesaSettingsInfo();
    assert.ok(info.callbackUrlMasked?.includes('…'), 'the callback token must be masked on screen');
  });
});

await test('the M-Pesa callback address must be public https (no SSRF / private targets)', () => {
  for (const bad of ['http://erp.example.co.ke', 'https://localhost', 'https://127.0.0.1', 'https://192.168.1.10', 'https://10.0.0.5', 'https://erp.example.co.ke?x=1', 'https://user:pw@erp.example.co.ke', 'javascript:alert(1)']) {
    assert.throws(() => mpesa.cleanMpesaInput({ shortCode: '174379', consumerKey: 'AbCdEf0123456789', publicBaseUrl: bad }), /public|https|address/i, bad);
  }
  // Daraja hosts are fixed per environment — an unknown environment falls back to sandbox, never a typed host.
  assert.deepStrictEqual(Object.values(mpesa.DARAJA_HOSTS).map((h) => new URL(h).hostname).sort(), ['api.safaricom.co.ke', 'sandbox.safaricom.co.ke']);
  assert.strictEqual(mpesa.cleanMpesaInput({ shortCode: '174379', consumerKey: 'AbCdEf0123456789', publicBaseUrl: 'https://h.example.com', environment: 'https://evil.example' }).environment, 'sandbox');
});

await test('a forged M-Pesa callback token is refused', async () => {
  for (const t of ['', 'x', 'a'.repeat(32), "' OR 1=1 --"]) assert.strictEqual(await mpesa.isValidCallbackToken(t), false);
});

await test('an M-Pesa payment posts once, replays are ignored, wrong amounts are parked', async () => {
  const inv = await one<{ customer_id: number; no: string }>("SELECT customer_id, document_no AS no FROM cust_ledger_entry WHERE open = 1 AND positive = 1 AND remaining_amount >= 200000 ORDER BY id LIMIT 1");
  if (!inv) throw new Skip('no open invoice with a balance');
  await sandbox(async () => {
    const ins = (checkout: string, amount: number) => run(
      `INSERT INTO mpesa_request (customer_id, document_no, environment, phone, amount, account_reference, checkout_request_id, requested_by, requested_at)
       VALUES (?, ?, 'sandbox', '254712345678', ?, ?, ?, 'security-test', ?)`, inv.customer_id, inv.no, amount, inv.no, checkout, new Date().toISOString());
    const callback = (checkout: string, amount: number, receipt: string, code = 0) => ({ Body: { stkCallback: {
      MerchantRequestID: 'm', CheckoutRequestID: checkout, ResultCode: code, ResultDesc: code ? 'Request cancelled by user' : 'The service request is processed successfully.',
      CallbackMetadata: code ? undefined : { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: receipt }, { Name: 'PhoneNumber', Value: 254712345678 }] },
    } } });
    // The M-Pesa bank account must exist for the payment to post (the setup the screen saves).
    await run("INSERT INTO integration_setting (key, value, updated_at) VALUES ('mpesa', '{\"paymentCode\":\"MPESA\"}'::jsonb, 'x') ON CONFLICT (key) DO NOTHING");
    const lines = async () => (await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM cust_ledger_entry WHERE customer_id = ? AND source_type = 'M-Pesa'", inv.customer_id))!.n;
    const before = await lines();

    await ins('ws_CO_SECTEST_1', 100000);
    const first = await mpesa.handleMpesaCallback(callback('ws_CO_SECTEST_1', 1000, 'SECTEST001'));
    assert.strictEqual(first?.status, 'POSTED');
    assert.strictEqual(first?.newlyPosted, true);
    assert.strictEqual(await lines(), before + 1);
    const replay = await mpesa.handleMpesaCallback(callback('ws_CO_SECTEST_1', 1000, 'SECTEST001'));
    assert.strictEqual(replay?.newlyPosted, false, 'a replayed callback must not post again');
    assert.strictEqual(await lines(), before + 1);

    await ins('ws_CO_SECTEST_2', 100000);
    const tampered = await mpesa.handleMpesaCallback(callback('ws_CO_SECTEST_2', 1, 'SECTEST002'));
    assert.strictEqual(tampered?.status, 'REVIEW', 'a paid amount different from the request must not post');
    assert.strictEqual(await lines(), before + 1);

    await ins('ws_CO_SECTEST_3', 100000);
    assert.strictEqual((await mpesa.handleMpesaCallback(callback('ws_CO_SECTEST_3', 0, '', 1032)))?.status, 'CANCELLED');
    assert.strictEqual(await mpesa.handleMpesaCallback(callback('ws_CO_UNKNOWN', 1000, 'SECTEST003')), null, 'an unknown prompt must change nothing');
  });
});

await test('e-mail settings refuse header injection and bad credentials', () => {
  assert.throws(() => mailSettings.cleanMailInput({ provider: 'gmail', fromAddress: 'a@example.com', fromName: 'Hotel\r\nBcc: victim@example.com' }), /line breaks/);
  assert.throws(() => mailSettings.cleanMailInput({ provider: 'gmail', fromAddress: 'a@example.com\r\nBcc: x@y.z' }), /address/i);
  assert.throws(() => mailSettings.cleanMailInput({ provider: 'resend', fromAddress: 'a@example.com', secret: 'not-a-key' }), /re_/);
});

await test('user text in notification e-mails is escaped (no HTML injection)', () => {
  const html = approvalDecidedEmail('<img src=x onerror=alert(1)>', false, '"><script>', '<a href="https://evil.example">click</a>', '/approvals');
  assert.ok(!/<script|<img|<a href="https:\/\/evil/i.test(html), 'unescaped user input in an e-mail');
});

await test('only administrators can change integrations; finance can only send prompts', async () => {
  const finance = await as('finance');
  assert.ok(canAction(finance, 'RECEIVABLES_MPESA_REQUEST'));
  for (const u of ['finance', 'director', 'cashier', 'auditor']) {
    const user = await as(u);
    assert.ok(!canAction(user, 'INTEGRATIONS_MPESA_MANAGE') && !canAction(user, 'INTEGRATIONS_EMAIL_MANAGE'), `${u} can change integrations`);
  }
});

section('3q. Field encryption keys');

await test('a value sealed with one key cannot be opened with another; the setup screens know when no key is set', async () => {
  const fc = await import('../lib/fieldCrypto.ts');
  const { randomBytes } = await import('node:crypto');
  const [a, b] = [randomBytes(32), randomBytes(32)];
  const sealed = fc.encryptWithKey(a, 'A1234567')!;
  assert.strictEqual(fc.decryptWithKey(a, sealed), 'A1234567');
  assert.throws(() => fc.decryptWithKey(b, sealed), 'a wrong key must fail authentication, not return garbage');
  assert.throws(() => fc.parseKey(Buffer.from('short').toString('base64')), /32 bytes/);
  assert.strictEqual(fc.fieldEncryptionStatus().ready, true, 'tests run with a key or the development fallback');
  // The production refusal is a message the administrator can act on — never a bare server error.
  assert.match(fc.MISSING_KEY_MESSAGE, /FIELD_ENCRYPTION_KEY/);
  assert.ok(!/[A-Za-z0-9+/]{40,}={0,2}/.test(fc.MISSING_KEY_MESSAGE), 'the message carries no key material');
});

section('3s. List exports — guards, bound filters and personal data');

const { LIST_EXPORTS } = await import('../lib/listExports/index.ts');
const { ADMIN_USERNAME } = await import('../lib/seed.ts');
const listExportEntries = Object.entries(LIST_EXPORTS);
const pageCodes = new Set(permissions.PAGES.map((p) => p.code));
const NEEDS_SERVER = new Set(['users', 'roles']);

await test('every list export names a guard, and every action and page it names exists', () => {
  const bad: string[] = [];
  for (const [key, def] of listExportEntries) {
    const actions = def.action === undefined ? [] : Array.isArray(def.action) ? def.action : [def.action];
    const pages = typeof def.page === 'function' ? [] : def.page === undefined ? [] : Array.isArray(def.page) ? def.page : [def.page];
    if (!actions.length && !def.page) bad.push(`${key}: no guard`);
    for (const a of [...actions, ...(def.alsoRequires ?? [])]) if (!(a in permissions.ACTIONS)) bad.push(`${key}: action ${a}`);
    for (const p of pages) if (!pageCodes.has(p)) bad.push(`${key}: page ${p}`);
  }
  assert.deepStrictEqual(bad, []);
});

await test('every Export to Excel on a screen points at an export that exists', () => {
  const used = new Set<string>();
  for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))].filter((x) => x.endsWith('.tsx'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/exportKey="([a-z0-9-]+)"|\/api\/export\/list\/([a-z0-9-]+)/g)) used.add(m[1] ?? m[2]);
  }
  assert.ok(used.size > 100, `expected the list screens to carry exports (found ${used.size})`);
  assert.deepStrictEqual([...used].filter((k) => !(k in LIST_EXPORTS)), []);
});

await test('the export route checks the session before it says whether an export exists', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/api/export/list/[key]/route.ts'), 'utf8');
  assert.ok(src.indexOf('getCurrentUser()') < src.indexOf('LIST_EXPORTS['), 'an anonymous caller must not be able to enumerate exports');
  assert.match(src, /canAction\(/);
  assert.match(src, /canPage\(/);
});

await test('every list export binds its filters — hostile values in every field and the search run as data', async () => {
  const admin = await as(ADMIN_USERNAME);
  const hostile = "x' OR '1'='1'; DROP TABLE customer; --";
  const failures: string[] = [];
  // users and roles load lib/admin.ts, which needs Next's request runtime — the HTTP probes cover them.
  for (const [key, def] of listExportEntries.filter(([k]) => !NEEDS_SERVER.has(k))) {
    const filters = def.fields.map((f) => ({
      field: f.key, operator: '=' as const,
      value: f.type === 'number' ? '1' : f.type === 'date' ? '2026-01-01' : f.type === 'select' ? String(f.options?.[0]?.value ?? hostile) : hostile,
    }));
    filters.push({ field: 'id; DROP TABLE customer', operator: '=' as const, value: '1' });
    try {
      const rows = await def.rows({ q: hostile, view: '', filters, sort: null, params: new URLSearchParams(), user: admin });
      assert.ok(Array.isArray(rows));
    } catch (err) {
      failures.push(`${key}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  assert.deepStrictEqual(failures, []);
});

await test('the patient export carries no identity numbers, and employee-free exports carry no salaries', () => {
  for (const key of ['patients']) {
    const keys = LIST_EXPORTS[key].columns.map((c) => c.key).join('|');
    assert.doesNotMatch(keys, /id_no|national_id|id_number|passport|salary|basic_pay/, `${key} exports personal data`);
  }
});

await test('M-Pesa exports print phone numbers masked; the outbox exports no message bodies', async () => {
  const admin = await as(ADMIN_USERNAME);
  const ctx = { q: '', view: '', filters: [], sort: null, params: new URLSearchParams(), user: admin };
  const def = LIST_EXPORTS['mpesa-requests'];
  const rows = await def.rows(ctx);
  const phoneCol = def.columns.find((c) => c.key === 'phone');
  assert.ok(phoneCol, 'mpesa-requests has a phone column to check');
  for (const r of rows as { phone: string }[]) {
    const shown = String(phoneCol!.value(r) ?? '');
    assert.ok(!shown || shown.includes('•'), 'phone printed in full');
  }
  const keys = LIST_EXPORTS.outbox.columns.map((c) => c.key).join('|');
  assert.doesNotMatch(keys, /recipient|body/, 'the outbox exports contact details');
});

await test('the finance exports of a tabbed module check the tab\'s page too', () => {
  const tabbed = ['aged-ap', 'aged-ar', 'bank-ledger', 'fa-book-value', 'item-quantities', 'journal', 'periods', 'trial-balance', 'gl-accounts'];
  const missing = tabbed.filter((r) => !/\}, '[A-Z_]+'\);\s*\}\s*$/.test(fs.readFileSync(path.join(ROOT, `app/api/export/${r}/route.ts`), 'utf8')));
  assert.deepStrictEqual(missing, []);
});

section(`4. Live HTTP probes${BASE_URL ? ` against ${BASE_URL}` : ' (skipped — set BASE_URL to run)'}`);

async function get(p: string, init: RequestInit = {}): Promise<Response> {
  if (!BASE_URL) throw new Skip('BASE_URL not set');
  try {
    return await fetch(BASE_URL + p, { redirect: 'manual', ...init });
  } catch (err) {
    throw new Skip(`server not reachable (${(err as Error).message})`);
  }
}
const isLoginRedirect = (r: Response) => [302, 303, 307, 308].includes(r.status) && /\/login/.test(r.headers.get('location') ?? '');

await test('responses carry the security headers and no X-Powered-By', async () => {
  const r = await get('/login');
  assert.ok(r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('x-powered-by'), null);
});

const PROTECTED = [
  '/dashboard', '/crm', '/crm/contacts', '/projects', '/projects/billing', '/timesheets/my', '/service-desk',
  '/contracts', '/compliance', '/compliance/registers', '/analytics', '/project-setup', '/accounting', '/payroll', '/employees',
  '/admin', '/admin/users', '/approvals', '/print/posted-sales/INV000001',
];
await test('protected pages send anonymous visitors to sign-in', async () => {
  const leaks: string[] = [];
  for (const p of PROTECTED) {
    const r = await get(p);
    if (!isLoginRedirect(r) && r.status !== 404) leaks.push(`${p} → ${r.status}`);
  }
  assert.deepStrictEqual(leaks, []);
});

await test('exports refuse anonymous callers', async () => {
  for (const p of ['/api/export/trial-balance', '/api/export/audit', '/api/export/payroll-register', '/api/export/aged-ar']) {
    const r = await get(p);
    assert.ok(r.status === 403 || r.status === 400 || isLoginRedirect(r), `${p} → ${r.status}`);
    assert.doesNotMatch(r.headers.get('content-type') ?? '', /spreadsheet/, `${p} returned a workbook`);
  }
});

await test('every list export refuses anonymous callers without saying whether it exists', async () => {
  const leaks: string[] = [];
  for (const key of [...Object.keys(LIST_EXPORTS), 'no-such-export']) {
    const r = await get(`/api/export/list/${key}`);
    if (r.status !== 401 || /spreadsheet/.test(r.headers.get('content-type') ?? '')) leaks.push(`${key} → ${r.status}`);
  }
  assert.deepStrictEqual(leaks, []);
});

/** A real session for a demo user, for probing the live server as them; removed afterwards. */
async function withSession(username: string, fn: (cookie: string) => Promise<void>): Promise<void> {
  if (!BASE_URL) throw new Skip('BASE_URL not set');
  const u = await as(username);
  const token = (await import('node:crypto')).randomBytes(32).toString('hex');
  const now = new Date();
  await run(
    'INSERT INTO session (token, user_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)',
    auth.hashSessionToken(token), u.id, now.toISOString(), new Date(now.getTime() + 3_600_000).toISOString(), now.toISOString(), '127.0.0.1', 'security-suite',
  );
  try {
    await fn(`cbe_session=${token}`);
  } finally {
    await run('DELETE FROM session WHERE token = ?', auth.hashSessionToken(token));
  }
}

/** Whether `user` may run an export — the same guard the route applies. */
function mayExport(user: SessionUser, key: string): boolean {
  const def = LIST_EXPORTS[key];
  const actions = def.action === undefined ? [] : Array.isArray(def.action) ? def.action : [def.action];
  if (actions.length && !actions.some((a) => canAction(user, a))) return false;
  if (def.alsoRequires?.some((a) => !canAction(user, a))) return false;
  const page = typeof def.page === 'function' ? def.page({ q: '', view: '', filters: [], sort: null, params: new URLSearchParams() }) : def.page;
  const pages = page === undefined ? [] : Array.isArray(page) ? page : [page];
  return !pages.length || pages.some((p) => permissions.canPage(user, p));
}

for (const username of ['reception', 'nurse']) {
  await test(`${username} gets exactly the exports their screens allow — 403 for the rest`, async () => {
    const user = await as(username);
    await withSession(username, async (cookie) => {
      const wrong: string[] = [];
      let allowed = 0;
      for (const key of Object.keys(LIST_EXPORTS)) {
        const may = mayExport(user, key);
        const r = await get(`/api/export/list/${key}`, { headers: { cookie } });
        const workbook = /spreadsheet/.test(r.headers.get('content-type') ?? '');
        if (may) { allowed++; if (r.status !== 200 || !workbook) wrong.push(`${key}: expected a workbook, got ${r.status} ${(await r.text()).slice(0, 80)}`); }
        else if (r.status !== 403 || workbook) wrong.push(`${key}: expected 403, got ${r.status}`);
      }
      assert.ok(allowed > 0, `${username} should be able to export something`);
      assert.deepStrictEqual(wrong, []);
    });
  });
}

await test('a filter naming an unknown column, or carrying SQL, is data — never an error or a leak', async () => {
  await withSession(ADMIN_USERNAME, async (cookie) => {
    const filters = encodeURIComponent(JSON.stringify([
      { field: 'no', operator: '=', value: "' OR 1=1 --" }, { field: 'd.id_no_enc', operator: '=', value: 'x' }, { field: 'status', operator: 'BETWEEN', value: 'a' },
    ]));
    for (const key of ['projects', 'crm-contacts', 'tickets', 'contracts']) {
      const r = await get(`/api/export/list/${key}?filters=${filters}&q=${encodeURIComponent("'; DROP TABLE customer; --")}`, { headers: { cookie } });
      assert.strictEqual(r.status, 200, `${key} → ${r.status}`);
    }
    const bad = await get(`/api/export/list/crm-contacts?filters=${encodeURIComponent('{not json')}`, { headers: { cookie } });
    assert.strictEqual(bad.status, 200, 'a malformed filter is ignored, not an error');
  });
});

await test('the internal job endpoint refuses missing and wrong tokens', async () => {
  for (const token of [undefined, '', 'guess', 'a'.repeat(36)]) {
    const r = await get('/api/internal/job-queue-tick', { method: 'POST', headers: token === undefined ? {} : { 'x-internal-token': token } });
    assert.strictEqual(r.status, 403);
  }
});

await test('the M-Pesa callback refuses unknown tokens and does not leak why', async () => {
  const body = JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_x', ResultCode: 0 } } });
  for (const token of ['a'.repeat(32), 'short', '..%2f..%2fetc']) {
    const r = await get(`/api/mpesa/callback/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.ok(r.status === 403 || r.status === 404, `${token} → ${r.status}`);
    assert.doesNotMatch(await r.text(), /token|secret|stack|Error:/i);
  }
});

await test('path traversal and injection payloads in routes do not error', async () => {
  for (const p of ['/print/..%2f..%2fetc%2fpasswd/1', '/projects/view/%27%20OR%201%3D1--', '/crm/contact/1%20OR%201=1', '/service-desk/tickets/%3Cscript%3E', '/timesheets/view/..%5C..%5Cwindows', '/print/constructor/1', '/print/__proto__/1', '/print/toString/1']) {
    const r = await get(p);
    assert.ok(r.status < 500, `${p} → ${r.status}`);
  }
});

await test('a cross-site form post to a Server Action is refused', async () => {
  const r = await get('/login', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded', 'Next-Action': '0'.repeat(40) },
    body: 'username=admin&password=x',
  });
  assert.ok(r.status >= 400 || r.status === 303 || r.status === 307, `cross-origin action → ${r.status}`);
  assert.ok(!(r.headers.get('set-cookie') ?? '').includes('cbe_session'), 'a cross-site post must never mint a session');
});

await test('the health endpoint does not leak configuration', async () => {
  const r = await get('/api/health');
  const text = await r.text();
  assert.doesNotMatch(text, /postgres(ql)?:\/\/|password|secret|DATABASE_URL|FIELD_ENCRYPTION_KEY/i);
  const body = JSON.parse(text);
  if (body.db === 'down') {
    assert.equal(r.status, 503);
    assert.equal(body.error, 'database_unavailable');
  }
});

/* ============================================================================ */

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
