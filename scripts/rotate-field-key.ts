/*
 * Re-encrypts every protected field from one key to another — director and member ID numbers and the
 * integration secrets (Daraja consumer secret, passkey, callback token; the e-mail password / key).
 *
 * Use it to move a database off the development fallback key onto a real FIELD_ENCRYPTION_KEY,
 * or to rotate a key. Every copy of the app that shares the database must then run with the new key.
 *
 *   1. Generate a key:   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   2. Put it in .env as FIELD_ENCRYPTION_KEY (and, when rotating a real key, the old one as
 *      FIELD_ENCRYPTION_KEY_OLD — without it the old key is the development fallback).
 *   3. Dry run, then apply:
 *        node --env-file=.env --conditions=react-server --experimental-transform-types scripts/rotate-field-key.ts
 *        node --env-file=.env --conditions=react-server --experimental-transform-types scripts/rotate-field-key.ts --apply
 *   4. Set the same FIELD_ENCRYPTION_KEY on the deployed server and restart it.
 *
 * Nothing is written unless every value can be read with the old key (or already uses the new one),
 * and it all happens in one transaction. Values are never printed.
 */
export {};
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.replace('-pooler.', '.');
const { all, run, tx } = await import('../lib/db.ts');
const { parseKey, developmentKey, encryptWithKey, decryptWithKey } = await import('../lib/fieldCrypto.ts');

const apply = process.argv.includes('--apply');
if (!process.env.FIELD_ENCRYPTION_KEY?.trim()) {
  console.error('FIELD_ENCRYPTION_KEY is not set — put the new key in .env first (see the header of this script).');
  process.exit(1);
}
const newKey = parseKey(process.env.FIELD_ENCRYPTION_KEY);
const oldKey = process.env.FIELD_ENCRYPTION_KEY_OLD?.trim() ? parseKey(process.env.FIELD_ENCRYPTION_KEY_OLD, 'FIELD_ENCRYPTION_KEY_OLD') : developmentKey();
if (oldKey.equals(newKey)) {
  console.error('The old and new keys are the same — nothing to do.');
  process.exit(1);
}

type Outcome = 'moved' | 'already-new' | 'unreadable';
/** The value under the new key, or why it cannot be. */
function reseal(stored: string): { outcome: Outcome; value?: string } {
  try {
    const plain = decryptWithKey(oldKey, stored);
    const next = encryptWithKey(newKey, plain)!;
    if (decryptWithKey(newKey, next) !== plain) throw new Error('round trip failed');
    return { outcome: 'moved', value: next };
  } catch {
    try { decryptWithKey(newKey, stored); return { outcome: 'already-new' }; } catch { return { outcome: 'unreadable' }; }
  }
}

const counts: Record<Outcome, number> = { moved: 0, 'already-new': 0, unreadable: 0 };
const problems: string[] = [];

await tx(async () => {
  // The registers of directors and members hold sealed ID numbers.
  const registerUpdates: [table: string, value: string, id: number][] = [];
  let registers = 0;
  for (const table of ['company_director', 'company_shareholder']) {
    const rows = await all<{ id: number; id_no_enc: string }>(`SELECT id, id_no_enc FROM ${table} WHERE id_no_enc IS NOT NULL ORDER BY id FOR UPDATE`);
    registers += rows.length;
    for (const g of rows) {
      const r = reseal(g.id_no_enc);
      counts[r.outcome]++;
      if (r.outcome === 'unreadable') problems.push(`${table} ${g.id}: ID number`);
      if (r.value) registerUpdates.push([table, r.value, g.id]);
    }
  }

  const settings = await all<{ key: string; value: Record<string, unknown> }>('SELECT key, value FROM integration_setting ORDER BY key FOR UPDATE');
  const settingUpdates: [string, string][] = [];
  for (const s of settings) {
    const next = { ...s.value };
    let changed = false;
    for (const [field, stored] of Object.entries(s.value)) {
      if (!field.endsWith('_enc') || typeof stored !== 'string' || !stored) continue;
      const r = reseal(stored);
      counts[r.outcome]++;
      if (r.outcome === 'unreadable') problems.push(`${s.key} setting: ${field}`);
      if (r.value) { next[field] = r.value; changed = true; }
    }
    if (changed) settingUpdates.push([JSON.stringify(next), s.key]);
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts, registers, settings: settings.length }));
  if (problems.length) {
    console.error(`Stopped — ${problems.length} value(s) cannot be read with either key, so nothing was changed:\n  ${problems.join('\n  ')}`);
    console.error('Set FIELD_ENCRYPTION_KEY_OLD to the key they were written with, or re-enter those values after switching keys.');
    process.exit(2);
  }
  if (!apply) { console.log('Dry run only — run again with --apply to re-encrypt.'); return; }
  for (const [table, value, id] of registerUpdates) await run(`UPDATE ${table} SET id_no_enc = ? WHERE id = ?`, value, id);
  for (const [value, key] of settingUpdates) await run('UPDATE integration_setting SET value = ?::jsonb WHERE key = ?', value, key);
  console.log(`Re-encrypted ${counts.moved} value(s). Now set the same FIELD_ENCRYPTION_KEY on every server that uses this database and restart them.`);
}, { timeout: 300_000 });
process.exit(0);
