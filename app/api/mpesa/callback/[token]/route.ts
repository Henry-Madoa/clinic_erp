/*
 * Safaricom Daraja STK-push callback. Not a user endpoint: Daraja posts here without a session,
 * so it authenticates by the random token in its path (lib/mpesa.ts isValidCallbackToken, compared
 * in constant time) and, when MPESA_ALLOWED_IPS is set, by the caller's address. Anything that
 * fails either check gets a bare 403 and touches nothing.
 *
 * A genuine callback is always acknowledged with ResultCode 0 — Daraja retries otherwise — and
 * resolving it is idempotent, so a retry or a race with "Check status" can never pay twice.
 */
import { after } from 'next/server';
import { handleMpesaCallback, isValidCallbackToken } from '@/lib/mpesa';
import { sendMpesaReceipt } from '@/lib/clientNotices';

const MAX_BODY = 16 * 1024;

function callerIp(request: Request): string {
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const allowed = (process.env.MPESA_ALLOWED_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(callerIp(request))) return new Response('Forbidden', { status: 403 });
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !(await isValidCallbackToken(token))) return new Response('Forbidden', { status: 403 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY) return new Response('Payload too large', { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response('Payload too large', { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ResultCode: 1, ResultDesc: 'Malformed JSON' }, { status: 400 });
  }
  try {
    const outcome = await handleMpesaCallback(body);
    // The client's receipt goes out after Safaricom has its acknowledgement.
    if (outcome?.newlyPosted) after(() => sendMpesaReceipt(outcome.id));
  } catch (err) {
    // Logged for the administrator; Safaricom is still told it arrived so it does not hammer us.
    console.error('[mpesa] callback not applied', (err as Error).message);
  }
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
