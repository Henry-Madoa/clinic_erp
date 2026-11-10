'use server';

/*
 * Admin Centre → Integrations (M-Pesa, Email & Notifications, KRA eTIMS), and finance's M-Pesa
 * prompt to a client for an open invoice. Every action authorises first; credentials go one way only (browser → sealed storage).
 */
import { revalidatePath } from 'next/cache';
import { requireAction } from '@/lib/session';
import { actionResult, AppError } from '@/lib/errors';
import { toCents } from '@/lib/format';
import * as mpesa from '@/lib/mpesa';
import * as mail from '@/lib/mailSettings';
import * as etims from '@/lib/etims';
import { escapeHtml } from '@/lib/mailer';
import { one } from '@/lib/db';
import { getOrgBrand } from '@/lib/org';
import type { ActionResult, FormValues } from '@/lib/types';

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim();

export async function saveMpesaSetupRequest(v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_MPESA_MANAGE');
    const input = mpesa.cleanMpesaInput(v);
    await mpesa.saveMpesaSettings(input, user, { rotateToken: v.rotateToken === 1 || v.rotateToken === '1' });
    revalidatePath('/admin/integrations/mpesa');
    return { message: input.enabled ? 'M-Pesa is on — finance can send payment prompts to clients from an invoice' : 'M-Pesa setup saved (switched off)' };
  });
}

export async function testMpesaSetupRequest(v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_MPESA_MANAGE');
    return { message: await mpesa.testMpesaCredentials(mpesa.cleanMpesaInput(v), user) };
  });
}

export async function saveMailSetupRequest(v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_EMAIL_MANAGE');
    const input = mail.cleanMailInput(v);
    await mail.saveMailSettings(input, user);
    revalidatePath('/admin/integrations/email');
    return { message: input.enabled ? `E-mail is on — sent through ${input.provider === 'gmail' ? 'Gmail' : 'Resend'}` : 'E-mail setup saved (switched off)' };
  });
}

export async function sendTestMailRequest(v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_EMAIL_MANAGE');
    const input = mail.cleanMailInput(v);
    const org = await getOrgBrand();
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;">${escapeHtml(org?.name ?? 'Wayside Clinic')}</h2>
      <p>This is a test e-mail from Admin Centre → Integrations, sent by ${escapeHtml(user.full_name || user.username)}.</p>
      <p>If you can read this, outgoing e-mail is set up correctly for approvals, invoices, ticket updates and payment receipts.</p></div>`;
    return { message: await mail.sendTestMail(input, str(v.testTo), user, html) };
  });
}

/** Finance: prompt a client to pay an open invoice (or on account) from their phone. */
export async function requestMpesaPromptRequest(customerNo: string, v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('RECEIVABLES_MPESA_REQUEST');
    const c = await one<{ id: number }>('SELECT id FROM customer WHERE no = ?', customerNo);
    if (!c) throw new AppError('Client not found', 'NOT_FOUND');
    const res = await mpesa.requestInvoiceMpesaPayment(c.id, str(v.document_no) || null, str(v.phone), toCents(str(v.amount) || '0'), user);
    revalidatePath('/receivables', 'layout');
    return { message: res.message };
  });
}

/* ---------------------------------------------------------------- KRA eTIMS */

export async function saveEtimsSetupRequest(v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_ETIMS_MANAGE');
    const input = etims.cleanEtimsInput(v);
    await etims.saveEtimsSettings(input, user);
    revalidatePath('/admin/integrations/etims');
    return { message: input.enabled ? 'eTIMS is on — every posted sales invoice and credit memo is reported to KRA' : 'eTIMS setup saved (switched off)' };
  });
}

export async function initialiseEtimsDeviceRequest(v: FormValues): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_ETIMS_MANAGE');
    // Save what is on the form first, so the device is initialised with exactly those details.
    await etims.saveEtimsSettings({ ...etims.cleanEtimsInput(v), enabled: false }, user);
    const message = await etims.initialiseDevice(user);
    revalidatePath('/admin/integrations/etims');
    return { message };
  });
}

export async function submitEtimsNowRequest(): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_ETIMS_MANAGE');
    const r = await etims.submitDue(user, 100);
    revalidatePath('/admin/integrations/etims');
    return { message: `${r.signed} signed, ${r.pending} still pending, ${r.failed} refused by KRA` };
  });
}

export async function retryEtimsInvoiceRequest(id: number): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INTEGRATIONS_ETIMS_MANAGE');
    await etims.retryInvoice(Number(id), user);
    const status = await etims.submitInvoice(Number(id), user);
    revalidatePath('/admin/integrations/etims');
    return { message: status === 'SIGNED' ? 'Signed by KRA' : status === 'FAILED' ? 'KRA refused it again — see the reason' : 'Queued — KRA could not be reached yet' };
  });
}

export async function checkMpesaStatusRequest(customerNo: string, requestId: number): Promise<ActionResult<{ message: string }>> {
  return actionResult(async () => {
    const user = await requireAction('RECEIVABLES_MPESA_REQUEST');
    // The request must belong to the client in the URL — no checking someone else's prompt by id.
    const c = await one<{ id: number }>('SELECT id FROM customer WHERE no = ?', customerNo);
    const rows = c ? await mpesa.listMpesaRequests(c.id) : [];
    if (!rows.some((r) => r.id === Number(requestId))) throw new AppError('M-Pesa request not found', 'NOT_FOUND');
    const { status } = await mpesa.queryMpesaRequest(Number(requestId), user);
    revalidatePath('/receivables', 'layout');
    const words: Record<string, string> = {
      PENDING: 'Still waiting on the client', POSTED: 'Paid — posted to the client\'s account', PAID_UNPOSTED: 'Paid, but could not be posted — see the request',
      REVIEW: 'Paid a different amount — needs review', FAILED: 'Failed', CANCELLED: 'The client cancelled the prompt', TIMEOUT: 'The client did not respond in time',
    };
    return { message: words[status] ?? status };
  });
}
