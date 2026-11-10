import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { AppError } from './errors.ts';

/*
 * Field-level encryption for personal data held at rest — directors' and members' passport /
 * national ID numbers above all. A database dump, a backup or a Configuration Package export never carries
 * the clear value.
 *
 * AES-256-GCM with a fresh 96-bit IV per value; the stored form is `v1:<base64(iv|tag|ct)>`.
 * The key is FIELD_ENCRYPTION_KEY — 32 random bytes, base64-encoded:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Production refuses to start encrypting without it. Development falls back to a key derived
 * from DATABASE_URL so a fresh checkout works, and says so once.
 *
 * Every copy of the app that shares a database (a laptop and the deployed site, say) must use the
 * SAME key, or one cannot read what the other wrote. Moving data from one key to another — the
 * development fallback to a real key, or a routine rotation — is scripts/rotate-field-key.ts.
 */

const VERSION = 'v1';
let cachedKey: Buffer | null = null;
let warned = false;

/** Shown when production has no key — the person at the screen can act on it; no key details. */
export const MISSING_KEY_MESSAGE =
  'Encryption is not set up on this server: FIELD_ENCRYPTION_KEY is missing, so passwords, API keys and ID numbers cannot be stored. '
  + 'Ask the system administrator to set it (the same value on every copy of the system that shares this database) and restart.';

/** The development fallback's input: the database URL with any connection-pooler host suffix
 *  removed, so the app (pooled) and scripts/seed.ts (direct host) derive the same key. */
export function devKeyMaterial(): string {
  return (process.env.DATABASE_URL ?? 'calbytes-erp-dev').replace('-pooler.', '.');
}

/** The key the development fallback uses — for scripts/rotate-field-key.ts moving data off it. */
export const developmentKey = (): Buffer => scryptSync(devKeyMaterial(), 'calbytes-erp-field-key-v1', 32);

/** A configured key: 32 bytes, base64. */
export function parseKey(b64: string, name = 'FIELD_ENCRYPTION_KEY'): Buffer {
  const k = Buffer.from(b64.trim(), 'base64');
  if (k.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return k;
}

/** Whether this server can encrypt: a configured key, or development's fallback. */
export function fieldEncryptionStatus(): { ready: boolean; configured: boolean } {
  const configured = Boolean(process.env.FIELD_ENCRYPTION_KEY?.trim());
  return { configured, ready: configured || process.env.NODE_ENV !== 'production' };
}

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const configured = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (configured) {
    cachedKey = parseKey(configured);
    return cachedKey;
  }
  if (process.env.NODE_ENV === 'production') {
    // A configuration fault the user can report in words, not a generic server error.
    throw new AppError(MISSING_KEY_MESSAGE, 'NOT_CONFIGURED');
  }
  if (!warned) {
    console.warn('  FIELD_ENCRYPTION_KEY is not set — using a development key derived from DATABASE_URL. Never run production like this.');
    warned = true;
  }
  cachedKey = developmentKey();
  return cachedKey;
}

export function encryptWithKey(k: Buffer, plain: string | null | undefined): string | null {
  const value = String(plain ?? '').trim();
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
}

export function decryptWithKey(k: Buffer, stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [version, payload] = stored.split(':');
  if (version !== VERSION || !payload) throw new AppError('Unreadable protected field', 'CRYPTO');
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  // A tampered value fails authentication here rather than decrypting to garbage.
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export const encryptField = (plain: string | null | undefined): string | null => (String(plain ?? '').trim() ? encryptWithKey(key(), plain) : null);

export const decryptField = (stored: string | null | undefined): string | null => (stored ? decryptWithKey(key(), stored) : null);

/** `•••• 1234` — what the desk sees without the PII right. */
export function maskTail(last4: string | null | undefined): string | null {
  return last4 ? `•••• ${last4}` : null;
}

export function lastFour(plain: string | null | undefined): string | null {
  const v = String(plain ?? '').replace(/\s+/g, '');
  return v ? v.slice(-4) : null;
}
