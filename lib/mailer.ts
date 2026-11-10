import 'server-only';
import { enqueueMessage, deliverMessage, registerTransport, TransportNotConfigured } from './outbox.ts';
import { getMailTransport, notificationEnabled, sendWith, type NotificationKey } from './mailSettings.ts';
import type { OutboxMessage } from './types.ts';

/*
 * E-mail — recorded in the message outbox (lib/outbox.ts), then delivered through the transport
 * set up under Admin Centre → Integrations → Email & Notifications (Gmail or Resend), falling back
 * to the RESEND_* environment variables.
 *
 * sendMail() never throws and never blocks the workflow action or posting that triggered it:
 * it writes the outbox row and makes one immediate attempt; a failure is retried by the
 * OUTBOX_DISPATCH job and, if it keeps failing, parked where an administrator can see it.
 * With no transport configured the row is parked with that reason rather than pretending it
 * was sent. A message tagged with a notification that the administrator switched off is not
 * queued at all.
 */

export interface SendMailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** The document this message is about — shown on the outbox so a failed send can be traced. */
  reference?: { type: string; no: string } | null;
  /** The notification this message belongs to; skipped when it is switched off. */
  notification?: NotificationKey;
}

/** The transport: one real send, throwing on failure so the outbox can retry or park it. */
export async function deliverMail(m: OutboxMessage): Promise<string | null> {
  const transport = await getMailTransport();
  if (!transport) throw new TransportNotConfigured('E-mail is not set up — Admin Centre → Integrations → Email & Notifications');
  const to = m.recipient.split(',').map((s) => s.trim()).filter(Boolean);
  return sendWith(transport, { to, subject: m.subject ?? '', html: m.body });
}
registerTransport('EMAIL', deliverMail);

export async function sendMail({ to, subject, html, reference = null, notification }: SendMailInput): Promise<void> {
  const recipient = (Array.isArray(to) ? to : [to]).map((s) => String(s).trim()).filter(Boolean).join(', ');
  if (!recipient) return;
  try {
    if (notification && !(await notificationEnabled(notification))) return;
    const sender = (await getMailTransport())?.fromAddress ?? null;
    const id = await enqueueMessage({ channel: 'EMAIL', recipient, subject, body: html, sender, reference });
    const r = await deliverMessage(id);
    if (!r.ok) console.warn('[mailer] not delivered yet', { id, to: recipient, subject, error: r.error });
  } catch (err) {
    console.error('[mailer] could not queue', err);
  }
}

/** Everything interpolated into an e-mail goes through this — names, comments and labels are user input. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const appUrl = (): string => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

/** `title` is escaped here; `bodyHtml` must already be escaped by its builder. */
const wrapper = (title: string, bodyHtml: string, link: string | null): string => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 12px;">${escapeHtml(title)}</h2>
    ${bodyHtml}
    ${link ? `<p style="margin-top:24px;">
      <a href="${escapeHtml(appUrl() + link)}" style="background:#0f7b52;color:#fff;padding:10px 18px;
        border-radius:6px;text-decoration:none;display:inline-block;">Open Wayside Clinic</a>
    </p>` : ''}
  </div>`;

export function approvalRequestedEmail(documentLabel: string, requestedBy: string, link: string): string {
  return wrapper(
    'Approval requested',
    `<p><b>${escapeHtml(documentLabel)}</b> was submitted by <b>${escapeHtml(requestedBy)}</b> and is waiting for your decision.</p>`,
    link,
  );
}

export function approvalDecidedEmail(
  documentLabel: string, approved: boolean, decidedBy: string, comment: string | null, link: string,
): string {
  return wrapper(
    approved ? 'Request approved' : 'Request rejected',
    `<p><b>${escapeHtml(documentLabel)}</b> was ${approved ? 'approved' : 'rejected'} by <b>${escapeHtml(decidedBy)}</b>.</p>
     ${comment ? `<p style="color:#555;">"${escapeHtml(comment)}"</p>` : ''}`,
    link,
  );
}

/** To the client contact: a support ticket raised or resolved. No staff link — clients have no account. */
export function ticketUpdateEmail(t: {
  companyName: string; contactName: string; ticketNo: string; subject: string; status: 'raised' | 'resolved'; priority: string; resolveBy: string | null; resolution: string | null;
}): string {
  return wrapper(
    t.status === 'raised' ? `Ticket ${t.ticketNo} received — ${t.companyName}` : `Ticket ${t.ticketNo} resolved — ${t.companyName}`,
    `<p>Dear ${escapeHtml(t.contactName)},</p>
     ${t.status === 'raised'
      ? `<p>We have logged your request <b>${escapeHtml(t.subject)}</b> as ticket <b>${escapeHtml(t.ticketNo)}</b> (priority ${escapeHtml(t.priority)}).</p>
         ${t.resolveBy ? `<p>Our target to resolve it is <b>${escapeHtml(t.resolveBy)}</b>.</p>` : ''}<p>Please quote the ticket number in any reply.</p>`
      : `<p>Your ticket <b>${escapeHtml(t.ticketNo)}</b> — ${escapeHtml(t.subject)} — has been resolved:</p>
         <blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #0E7490;background:#f4f8fa;">${escapeHtml(t.resolution ?? '')}</blockquote>
         <p>If the problem returns, reply quoting the ticket number and we will reopen it.</p>`}`,
    null,
  );
}

/** To the client: an M-Pesa payment received against their account. */
export function paymentReceiptEmail(p: { companyName: string; customerName: string; reference: string; amount: string; receipt: string; balance: string }): string {
  return wrapper(
    `Payment received — ${p.companyName}`,
    `<p>Dear ${escapeHtml(p.customerName)},</p>
     <p>We have received your M-Pesa payment of <b>${escapeHtml(p.amount)}</b> (receipt ${escapeHtml(p.receipt)}) for ${escapeHtml(p.reference)}.</p>
     <p>Your account balance is now <b>${escapeHtml(p.balance)}</b>. Thank you for your business.</p>`,
    null,
  );
}
