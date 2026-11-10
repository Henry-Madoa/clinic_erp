import 'server-only';
import { randomBytes } from 'node:crypto';
import { one, run } from './db.ts';
import { encryptField, decryptField } from './fieldCrypto.ts';

/*
 * Admin-configured integrations (Admin Centre → Integrations), one JSON row per key in
 * integration_setting. Secrets — the Daraja consumer secret and passkey, the Gmail app password,
 * a Resend API key, the M-Pesa callback token — are sealed with lib/fieldCrypto.ts before they are
 * written and are never sent to the browser: screens get an `info` view that says only whether a
 * secret is stored. A blank secret on save keeps the stored one, so an administrator can change
 * the other fields without re-typing credentials.
 */

type IntegrationKey = 'mpesa' | 'mail' | 'etims';

interface Row { value: Record<string, unknown>; updated_at: string; updated_by: string | null }

export async function readIntegration(key: IntegrationKey): Promise<Row | undefined> {
  return one<Row>('SELECT value, updated_at, updated_by FROM integration_setting WHERE key = ?', key);
}

export async function writeIntegration(key: IntegrationKey, value: Record<string, unknown>, by: string): Promise<void> {
  await run(
    `INSERT INTO integration_setting (key, value, updated_at, updated_by) VALUES (?, ?::jsonb, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    key, JSON.stringify(value), new Date().toISOString(), by,
  );
}

/** Seals a secret for storage. */
export const sealSecret = (plain: string): string => encryptField(plain)!;

/** Opens a stored secret; null when absent or unreadable (the encryption key changed). */
export function openSecret(stored: unknown): string | null {
  if (typeof stored !== 'string' || !stored) return null;
  try {
    return decryptField(stored);
  } catch {
    return null;
  }
}

/** The new stored form of a secret field: the typed value sealed, or the existing one kept. */
export const nextSecret = (typed: string, existing: unknown): string | null =>
  typed ? sealSecret(typed) : (typeof existing === 'string' && existing ? existing : null);

/** A URL-safe random token (the M-Pesa callback path secret). */
export const randomToken = (): string => randomBytes(24).toString('base64url');
