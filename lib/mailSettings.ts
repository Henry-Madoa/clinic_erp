import 'server-only';
import nodemailer from 'nodemailer';
import { audit } from './db.ts';
import { AppError } from './errors.ts';
import { readIntegration, writeIntegration, openSecret, nextSecret } from './integrationSettings.ts';
import type { Actor } from './types.ts';

/*
 * Outgoing e-mail and which notifications use it — Admin Centre → Integrations → Email &
 * Notifications. Ported from bc_member_portal's lib/mail-settings.ts (Gmail SMTP with an app
 * password), with Resend kept as a second provider since this system already spoke to it.
 *
 * The app password / API key is sealed at rest and never sent to the browser. Until e-mail is set
 * up and switched on here, the RESEND_API_KEY / RESEND_FROM_EMAIL environment variables are used
 * (as before); with neither, the outbox parks messages as "not configured".
 */

export type MailProvider = 'gmail' | 'resend';

/** The notifications an administrator can switch on or off. */
export const NOTIFICATIONS = {
  approvals: 'Approval requests and decisions (to approvers and requesters)',
  ticketUpdates: 'Support ticket raised / resolved (to the client contact)',
  paymentReceipt: 'M-Pesa payment receipt (to the client)',
  hrNotices: 'Leave and staff-exit notices (to staff)',
} as const;
export type NotificationKey = keyof typeof NOTIFICATIONS;

export interface MailSettingsInput {
  enabled: boolean;
  provider: MailProvider;
  /** The sending address: the Gmail / Workspace account, or a Resend-verified address. */
  fromAddress: string;
  fromName: string;
  replyTo: string;
  /** Gmail app password or Resend API key. Blank keeps the stored one. */
  secret: string;
  notifications: Record<NotificationKey, boolean>;
}

export interface MailSettingsInfo extends Omit<MailSettingsInput, 'secret'> {
  hasSecret: boolean;
  secretUnreadable: boolean;
  /** RESEND_* environment variables would be used while this is off. */
  envFallback: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** What a send needs. */
export interface MailTransportConfig { provider: MailProvider; fromAddress: string; fromName: string; replyTo: string; secret: string }

const DEFAULT_NOTIFICATIONS: Record<NotificationKey, boolean> = { approvals: true, ticketUpdates: true, paymentReceipt: true, hrNotices: true };
const BLANK: Omit<MailSettingsInput, 'secret'> = { enabled: false, provider: 'gmail', fromAddress: '', fromName: '', replyTo: '', notifications: DEFAULT_NOTIFICATIONS };

const envFallback = (): boolean => Boolean(process.env.RESEND_API_KEY);

export async function getMailSettingsInfo(): Promise<MailSettingsInfo> {
  const row = await readIntegration('mail');
  if (!row) return { ...BLANK, hasSecret: false, secretUnreadable: false, envFallback: envFallback(), updatedAt: null, updatedBy: null };
  const { secret_enc, ...rest } = row.value as Record<string, unknown>;
  const value = { ...BLANK, ...(rest as Partial<MailSettingsInput>) };
  return {
    ...value,
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(value.notifications ?? {}) },
    hasSecret: Boolean(secret_enc), secretUnreadable: Boolean(secret_enc) && !openSecret(secret_enc),
    envFallback: envFallback(), updatedAt: row.updated_at, updatedBy: row.updated_by,
  };
}

/** The transport in use: this setup when switched on, else the RESEND_* environment, else null. */
export async function getMailTransport(): Promise<MailTransportConfig | null> {
  try {
    const row = await readIntegration('mail');
    if (row) {
      const { secret_enc, ...rest } = row.value as Record<string, unknown>;
      const v = { ...BLANK, ...(rest as Partial<MailSettingsInput>) };
      const secret = openSecret(secret_enc);
      if (v.enabled && secret && v.fromAddress) return { provider: v.provider, fromAddress: v.fromAddress, fromName: v.fromName, replyTo: v.replyTo, secret };
    }
  } catch (err) {
    console.error('[mail] settings unavailable', (err as Error).message);
  }
  const key = process.env.RESEND_API_KEY;
  return key ? { provider: 'resend', fromAddress: process.env.RESEND_FROM_EMAIL || 'notifications@example.com', fromName: '', replyTo: '', secret: key } : null;
}

/** Whether a notification is switched on (on by default, so nothing goes quiet on upgrade). */
export async function notificationEnabled(key: NotificationKey): Promise<boolean> {
  try {
    const row = await readIntegration('mail');
    const n = (row?.value as { notifications?: Partial<Record<NotificationKey, boolean>> } | undefined)?.notifications;
    return n?.[key] ?? DEFAULT_NOTIFICATIONS[key];
  } catch {
    return DEFAULT_NOTIFICATIONS[key];
  }
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function cleanMailInput(raw: Record<string, unknown>): MailSettingsInput {
  const s = (k: string) => String(raw[k] ?? '').trim();
  const on = (k: string) => raw[k] === 1 || raw[k] === '1' || raw[k] === true || raw[k] === 'on';
  const provider: MailProvider = s('provider') === 'resend' ? 'resend' : 'gmail';
  const v: MailSettingsInput = {
    enabled: on('enabled'), provider,
    fromAddress: s('fromAddress').toLowerCase(), fromName: s('fromName').slice(0, 100), replyTo: s('replyTo').toLowerCase(),
    secret: provider === 'gmail' ? s('secret').replace(/\s+/g, '') : s('secret'),
    notifications: Object.fromEntries((Object.keys(NOTIFICATIONS) as NotificationKey[]).map((k) => [k, on(`notify_${k}`)])) as Record<NotificationKey, boolean>,
  };
  const problem =
    (!EMAIL_RE.test(v.fromAddress) && (provider === 'gmail' ? 'Enter the Gmail (or Google Workspace) address that sends the mail' : 'Enter the sending address verified in Resend')) ||
    (v.replyTo !== '' && !EMAIL_RE.test(v.replyTo) && 'Enter a valid reply-to address') ||
    (/[<>"\r\n]/.test(v.fromName) && 'Remove < > quotes and line breaks from the sender name') ||
    (v.secret !== '' && provider === 'gmail' && !/^[A-Za-z0-9]{16}$/.test(v.secret) && 'A Google app password is 16 letters (spaces are ignored)') ||
    (v.secret !== '' && provider === 'resend' && !/^re_[A-Za-z0-9_]{10,100}$/.test(v.secret) && 'A Resend API key starts with re_');
  if (problem) throw new AppError(problem, 'VALIDATION');
  return v;
}

export async function saveMailSettings(input: MailSettingsInput, user: Actor): Promise<void> {
  const existing = (await readIntegration('mail'))?.value ?? {};
  // A stored secret belongs to its provider: switching provider needs the new one typed in.
  const keep = existing.provider === input.provider ? existing.secret_enc : null;
  const secret_enc = nextSecret(input.secret, keep);
  if (input.enabled && !openSecret(secret_enc)) {
    throw new AppError(input.provider === 'gmail' ? 'Enter the Gmail app password before switching e-mail on' : 'Enter the Resend API key before switching e-mail on', 'VALIDATION');
  }
  const { secret: _s, ...plain } = input;
  await writeIntegration('mail', { ...plain, secret_enc }, user.username);
  await audit(user, 'MAIL_SETUP_SAVE', 'integration_setting', 'mail', {
    enabled: input.enabled, provider: input.provider, from: input.fromAddress, secretChanged: Boolean(input.secret), notifications: input.notifications,
  });
}

/** Sends one message; throws with the provider's reason on failure (the outbox retries). */
export async function sendWith(c: MailTransportConfig, m: { to: string[]; subject: string; html: string }): Promise<string | null> {
  if (c.provider === 'gmail') {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: c.fromAddress, pass: c.secret.replace(/\s+/g, '') },
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    });
    try {
      const info = await transport.sendMail({
        from: { name: c.fromName || c.fromAddress, address: c.fromAddress }, to: m.to, replyTo: c.replyTo || undefined,
        subject: m.subject, html: m.html,
      });
      return info.messageId ?? null;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      throw new Error(/Invalid login|Username and Password not accepted|535/i.test(text)
        ? 'Gmail rejected the sign-in — use an app password (Google Account → Security → App passwords), not the normal password'
        : text);
    } finally {
      transport.close();
    }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: c.fromName ? `${c.fromName} <${c.fromAddress}>` : c.fromAddress, to: m.to, subject: m.subject, html: m.html,
      ...(c.replyTo ? { reply_to: c.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? 'send failed'}`);
  return body.id ?? null;
}

/** "Send test email" with the form's values (stored secret if left blank). */
export async function sendTestMail(input: MailSettingsInput, to: string, user: Actor, html: string): Promise<string> {
  if (!EMAIL_RE.test(to)) throw new AppError('Enter where to send the test e-mail', 'VALIDATION');
  const existing = (await readIntegration('mail'))?.value ?? {};
  const secret = input.secret || (existing.provider === input.provider ? openSecret(existing.secret_enc) : null) || '';
  if (!secret) throw new AppError(input.provider === 'gmail' ? 'Enter the app password to test with' : 'Enter the API key to test with', 'VALIDATION');
  try {
    await sendWith({ provider: input.provider, fromAddress: input.fromAddress, fromName: input.fromName, replyTo: input.replyTo, secret }, { to: [to], subject: 'Wayside Clinic test e-mail', html });
  } catch (err) {
    await audit(user, 'MAIL_SETUP_TEST', 'integration_setting', 'mail', { to, ok: false });
    throw new AppError(`The e-mail could not be sent: ${(err as Error).message}`.slice(0, 300), 'MAIL');
  }
  await audit(user, 'MAIL_SETUP_TEST', 'integration_setting', 'mail', { to, ok: true });
  return `Test e-mail sent to ${to} — check the inbox (and the spam folder).`;
}
