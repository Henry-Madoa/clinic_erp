'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/primitives';
import { Field, readForm } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  saveMpesaSetupRequest, testMpesaSetupRequest, saveMailSetupRequest, sendTestMailRequest, saveEtimsSetupRequest, initialiseEtimsDeviceRequest,
} from '@/app/actions/integrations';
import type { EtimsSettingsInfo } from '@/lib/etims';
import type { MpesaSettingsInfo } from '@/lib/mpesa';
import type { MailSettingsInfo, NotificationKey } from '@/lib/mailSettings';
import type { ActionResult, FormValues } from '@/lib/types';

type Run = (v: FormValues) => Promise<ActionResult<{ message: string }>>;

/** Test and Save share one form: the values are read once and never put in a URL. */
function useSetupForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const go = async (kind: 'test' | 'save', fn: Run, okTitle: string, extra: FormValues = {}) => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setBusy(kind);
    try {
      const res = await fn({ ...readForm(form), ...extra });
      if (!res.ok) { toast(kind === 'test' ? 'Test failed' : 'Could not save', res.error, 'err'); return; }
      toast(okTitle, res.data.message, 'ok');
      if (kind === 'save') {
        // Secrets are never echoed back: clear what was typed so it does not linger in the page.
        form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach((i) => { i.value = ''; });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };
  return { formRef, busy, go };
}

/** Production without FIELD_ENCRYPTION_KEY: nothing secret can be stored, so say so before anyone types it in. */
function NoEncryptionCallout() {
  return (
    <div className="callout bad">
      <b>Saving is unavailable on this server:</b> encryption is not set up (FIELD_ENCRYPTION_KEY is missing), so the secrets in this form
      cannot be stored. &ldquo;Test&rdquo; still works. Ask the system administrator to set the key — the same value on every copy of the
      system that shares this database — and restart the server.
    </div>
  );
}

const saved = (at: string | null, by: string | null) =>
  at ? `Last saved ${new Date(at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} by ${by ?? '—'}` : 'Not saved yet';

export function MpesaSetupForm({ info, paymentCodes, encryptionReady }: {
  info: MpesaSettingsInfo; paymentCodes: { value: string; label: string }[]; encryptionReady: boolean;
}) {
  const { formRef, busy, go } = useSetupForm();
  const secretStored = info.hasSecret && !info.secretsUnreadable;
  const passStored = info.hasPassKey && !info.secretsUnreadable;
  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); go('save', saveMpesaSetupRequest, 'M-Pesa setup saved'); }} method="post" autoComplete="off">
      {!info.enabled ? <div className="callout warn">M-Pesa is switched off — cashiers cannot send payment prompts until it is set up and saved with &ldquo;Accept M-Pesa&rdquo; ticked.</div> : null}
      {!encryptionReady ? <NoEncryptionCallout /> : null}
      {encryptionReady && info.secretsUnreadable ? <div className="callout bad">A stored secret can no longer be read (the encryption key changed). Enter the consumer secret and passkey again and save.</div> : null}
      <Card>
        <h3>Daraja app</h3>
        <div className="card-sub">
          From the company&apos;s app on the Safaricom Daraja portal (developer.safaricom.co.ke): the consumer key and secret, and the
          Lipa na M-Pesa Online passkey issued for the paybill or till. Sandbox credentials go with the sandbox environment.
        </div>
        <div className="grid g2">
          <Field name="environment" label="Environment" type="select" required defaultValue={info.environment}
            options={[{ value: 'sandbox', label: 'Sandbox — testing (sandbox.safaricom.co.ke)' }, { value: 'production', label: 'Production — live money (api.safaricom.co.ke)' }]} />
          <Field name="transactionType" label="Transaction type" type="select" required defaultValue={info.transactionType}
            options={[{ value: 'CustomerPayBillOnline', label: 'Paybill' }, { value: 'CustomerBuyGoodsOnline', label: 'Till (Buy Goods)' }]} />
          <Field name="consumerKey" label="Consumer key" required defaultValue={info.consumerKey} maxLength={100} />
          <Field name="consumerSecret" label="Consumer secret" type="password" maxLength={200}
            placeholder={secretStored ? '•••••••• stored — leave blank to keep' : ''} hint="Encrypted before it is stored; never shown again." />
          <Field name="passKey" label="Passkey" type="password" maxLength={200}
            placeholder={passStored ? '•••••••• stored — leave blank to keep' : ''} hint="Lipa na M-Pesa Online passkey. Encrypted before it is stored." />
        </div>
      </Card>
      <Card>
        <h3>Paybill / till and posting</h3>
        <div className="grid g2">
          <Field name="shortCode" label="Business short code" required defaultValue={info.shortCode} maxLength={7} hint="The paybill or till number clients pay into." />
          <Field name="partyB" label="Party B (optional)" defaultValue={info.partyB} maxLength={7} hint="Blank uses the short code; for Buy Goods, the till number." />
          <Field name="publicBaseUrl" label="Public address of this system" required defaultValue={info.publicBaseUrl} placeholder="https://app.waysideclinic.co.ke"
            hint="Safaricom posts payment results here; it must be public and https." />
          <Field name="paymentCode" label="Post paid prompts as" type="select" required defaultValue={info.paymentCode} options={paymentCodes}
            hint="The bank / cash account (Cash Management) that receives M-Pesa payments." />
        </div>
        {info.callbackUrlMasked ? <div className="hint" style={{ marginTop: 8 }}>Callback URL sent to Safaricom: <span className="mono">{info.callbackUrlMasked}</span> (the secret part is masked).</div> : null}
        <div className="grid g2" style={{ marginTop: 8 }}>
          <Field name="enabled" label="Accept M-Pesa — let cashiers send payment prompts with this setup" type="checkbox" defaultValue={info.enabled ? 1 : 0} />
          <Field name="rotateToken" label="Issue a new callback URL on save (invalidates the old one)" type="checkbox" defaultValue={0} />
        </div>
      </Card>
      <div className="inline" style={{ justifyContent: 'flex-end' }}>
        <span className="tiny" style={{ marginRight: 'auto' }}>{saved(info.updatedAt, info.updatedBy)}</span>
        <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => go('test', testMpesaSetupRequest, 'Credentials accepted')}>
          {busy === 'test' ? 'Testing…' : 'Test credentials'}
        </button>
        <button type="submit" className="btn" disabled={busy !== null || !encryptionReady}>{busy === 'save' ? 'Saving…' : 'Save setup'}</button>
      </div>
    </form>
  );
}

export function MailSetupForm({ info, notifications, adminEmail, encryptionReady }: {
  info: MailSettingsInfo; notifications: [NotificationKey, string][]; adminEmail: string; encryptionReady: boolean;
}) {
  const { formRef, busy, go } = useSetupForm();
  const [provider, setProvider] = useState(info.provider);
  const stored = info.hasSecret && !info.secretUnreadable;
  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); go('save', saveMailSetupRequest, 'E-mail setup saved'); }} method="post" autoComplete="off">
      {!info.enabled ? (
        <div className="callout warn">
          E-mail is switched off here. {info.envFallback ? 'Messages currently go through the RESEND_* settings in the server environment.' : 'Messages wait in the Message Outbox as “not configured”.'}
        </div>
      ) : null}
      {!encryptionReady ? <NoEncryptionCallout /> : null}
      {encryptionReady && info.secretUnreadable ? <div className="callout bad">The stored password / API key can no longer be read (the encryption key changed). Enter it again and save.</div> : null}
      <Card>
        <h3>Sending account</h3>
        <div className="card-sub">
          {provider === 'gmail'
            ? <>Turn on 2-Step Verification for the Gmail or Google Workspace account, then create an app password under <b>Google Account → Security → App passwords</b> and paste it here. The normal Gmail password will not work.</>
            : <>Create an API key in the Resend dashboard and send from an address on a domain verified there.</>}
        </div>
        <div className="grid g2">
          <Field name="provider" label="Provider" type="select" required defaultValue={info.provider}
            options={[{ value: 'gmail', label: 'Gmail / Google Workspace (SMTP)' }, { value: 'resend', label: 'Resend (API)' }]}
            onChange={(e) => setProvider(e.target.value === 'resend' ? 'resend' : 'gmail')} />
          <Field name="fromAddress" label={provider === 'gmail' ? 'Gmail address' : 'From address'} type="email" required defaultValue={info.fromAddress} maxLength={200} />
          <Field name="secret" label={provider === 'gmail' ? 'App password' : 'API key'} type="password" maxLength={200}
            placeholder={stored && provider === info.provider ? '•••••••• stored — leave blank to keep' : provider === 'gmail' ? '16 letters, e.g. abcd efgh ijkl mnop' : 're_…'}
            hint="Encrypted before it is stored; never shown again." />
          <Field name="fromName" label="Sender name" defaultValue={info.fromName} maxLength={100} hint="Shown as the sender, e.g. the company's name." />
          <Field name="replyTo" label="Reply-to address" type="email" defaultValue={info.replyTo} maxLength={200} hint="Optional — where clients' replies go." />
        </div>
        <div style={{ marginTop: 8 }}>
          <Field name="enabled" label="Send the system's e-mail through this account" type="checkbox" defaultValue={info.enabled ? 1 : 0} />
        </div>
      </Card>
      <Card>
        <h3>Notifications</h3>
        <div className="card-sub">Which messages are sent. Switching one off stops it from being queued at all.</div>
        <div className="grid g2">
          {notifications.map(([key, label]) => (
            <Field key={key} name={`notify_${key}`} label={label} type="checkbox" defaultValue={info.notifications[key] ? 1 : 0} />
          ))}
        </div>
      </Card>
      <Card>
        <h3>Send a test e-mail</h3>
        <div className="card-sub">Uses the values above, saved or not, so they can be checked before saving.</div>
        <div className="grid g2">
          <Field name="testTo" label="Send the test to" type="email" defaultValue={adminEmail || info.fromAddress} />
        </div>
      </Card>
      <div className="inline" style={{ justifyContent: 'flex-end' }}>
        <span className="tiny" style={{ marginRight: 'auto' }}>{saved(info.updatedAt, info.updatedBy)}</span>
        <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => go('test', sendTestMailRequest, 'Test e-mail sent')}>
          {busy === 'test' ? 'Sending…' : 'Send test e-mail'}
        </button>
        <button type="submit" className="btn" disabled={busy !== null || !encryptionReady}>{busy === 'save' ? 'Saving…' : 'Save setup'}</button>
      </div>
    </form>
  );
}

export function EtimsSetupForm({ info, encryptionReady }: { info: EtimsSettingsInfo; encryptionReady: boolean }) {
  const { formRef, busy, go } = useSetupForm();
  const keyStored = info.hasCmcKey && !info.cmcKeyUnreadable;
  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); go('save', saveEtimsSetupRequest, 'eTIMS setup saved'); }} method="post" autoComplete="off">
      {!encryptionReady ? <NoEncryptionCallout /> : null}
      {!info.enabled ? <div className="callout warn">eTIMS is switched off — sales are not being reported to KRA. Set it up, initialise the device, then tick &ldquo;Report sales&rdquo; and save.</div> : null}
      {encryptionReady && info.cmcKeyUnreadable ? <div className="callout bad">The stored communication key can no longer be read (the encryption key changed). Initialise the device again.</div> : null}
      <Card>
        <h3>KRA eTIMS — Online Sales Control Unit (OSCU)</h3>
        <div className="card-sub">
          Register the company for OSCU on the KRA eTIMS portal first; KRA issues the branch and the device serial number. &ldquo;Initialise device&rdquo;
          then fetches the device&apos;s communication key from KRA (stored encrypted). Test against the sandbox before production.
        </div>
        <div className="grid g2">
          <Field name="environment" label="Environment" type="select" required defaultValue={info.environment}
            options={[{ value: 'sandbox', label: 'Sandbox — testing (etims-api-sbx.kra.go.ke)' }, { value: 'production', label: 'Production — live tax invoices (etims-api.kra.go.ke)' }]} />
          <Field name="tin" label="Company's KRA PIN" required defaultValue={info.tin} maxLength={11} uppercase placeholder="P051234567X" />
          <Field name="bhfId" label="Branch ID" required defaultValue={info.bhfId} maxLength={2} hint="00 for the head office" />
          <Field name="dvcSrlNo" label="Device serial number" required defaultValue={info.dvcSrlNo} maxLength={50} hint="As registered with KRA for this OSCU" />
          <Field name="itemClsCd" label="Item classification code" required defaultValue={info.itemClsCd} maxLength={10}
            hint="The KRA classification your services are registered under (from KRA's item classification list)" />
          <Field name="nonVatBand" label="Charges without VAT report as" type="select" defaultValue={info.nonVatBand}
            options={[{ value: 'A', label: 'A — exempt' }, { value: 'C', label: 'C — zero-rated' }, { value: 'D', label: 'D — non-VAT' }]} />
          <Field name="cmcKey" label="Communication key (optional)" type="password" maxLength={200}
            placeholder={keyStored ? '•••••••• stored — leave blank to keep' : 'Leave blank — Initialise device fetches it'} hint="Only if KRA gave you the key another way. Encrypted before it is stored." />
        </div>
        {info.initialisedAt ? <div className="hint" style={{ marginTop: 8 }}>Device initialised {new Date(info.initialisedAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}{info.sdcId ? ` · control unit ${info.sdcId}` : ''}{info.mrcNo ? ` · MRC ${info.mrcNo}` : ''}</div> : null}
        <div style={{ marginTop: 8 }}>
          <Field name="enabled" label="Report sales — sign every posted sales invoice and credit memo with KRA" type="checkbox" defaultValue={info.enabled ? 1 : 0} />
        </div>
      </Card>
      <div className="inline" style={{ justifyContent: 'flex-end' }}>
        <span className="tiny" style={{ marginRight: 'auto' }}>{saved(info.updatedAt, info.updatedBy)}</span>
        <button type="button" className="btn ghost" disabled={busy !== null || !encryptionReady} onClick={() => go('test', initialiseEtimsDeviceRequest, 'Device initialised')}>
          {busy === 'test' ? 'Contacting KRA…' : 'Initialise device'}
        </button>
        <button type="submit" className="btn" disabled={busy !== null || !encryptionReady}>{busy === 'save' ? 'Saving…' : 'Save setup'}</button>
      </div>
    </form>
  );
}
