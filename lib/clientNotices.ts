import 'server-only';
import { one } from './db.ts';
import { sendMail, paymentReceiptEmail } from './mailer.ts';
import { getOrgBrand } from './org.ts';
import { formatMoney } from './format.ts';

/*
 * E-mails to payers, each behind its switch on Admin Centre → Integrations → Email & Notifications.
 * Called after the payment has committed — a slow or failing mail server never holds anything up —
 * and never throws (sendMail queues and retries through the outbox).
 */

const companyName = async (): Promise<string> => (await getOrgBrand())?.name ?? 'Wayside Clinic';

export async function sendMpesaReceipt(requestId: number): Promise<void> {
  try {
    const m = await one<{ customer_id: number; account_reference: string; paid_amount: number; mpesa_receipt: string | null; name: string; email: string | null; balance: number }>(
      `SELECT m.customer_id, m.account_reference, m.paid_amount, m.mpesa_receipt, c.name, c.email, c.balance
       FROM mpesa_request m JOIN customer c ON c.id = m.customer_id WHERE m.id = ? AND m.status = 'POSTED'`, requestId);
    if (!m?.email) return;
    const name = await companyName();
    await sendMail({
      to: m.email, notification: 'paymentReceipt', reference: { type: 'MPESA', no: m.mpesa_receipt ?? String(requestId) },
      subject: `Payment received — ${name}`,
      html: paymentReceiptEmail({
        companyName: name, customerName: m.name, reference: m.account_reference,
        amount: formatMoney(Number(m.paid_amount)), receipt: m.mpesa_receipt ?? '—', balance: formatMoney(Number(m.balance)),
      }),
    });
  } catch (err) {
    console.error('[notices] payment receipt not sent', (err as Error).message);
  }
}
