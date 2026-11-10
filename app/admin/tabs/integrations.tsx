import Link from 'next/link';
import { filterRows, parseFilters } from '@/lib/listFilters';
import { ListTools } from '@/components/ui/list-tools';
import { ADMIN_FIELDS } from '@/lib/listExports/admin';
import { requireAction } from '@/lib/session';
import { getMpesaSettingsInfo, listRecentMpesaRequests, maskPhone } from '@/lib/mpesa';
import { getMailSettingsInfo, NOTIFICATIONS, type NotificationKey } from '@/lib/mailSettings';
import { formatDateTime, humanise } from '@/lib/format';
import { Card, CardHead, EmptyState, Pill, TableWrap, Toolbar } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money';
import { fieldEncryptionStatus } from '@/lib/fieldCrypto';
import { MpesaSetupForm, MailSetupForm, EtimsSetupForm } from '../integrations-forms';
import { getEtimsSettingsInfo, listEtimsInvoices } from '@/lib/etims';
import { all } from '@/lib/db';
import { RunButton } from '@/components/ui/modal-form';
import { submitEtimsNowRequest, retryEtimsInvoiceRequest } from '@/app/actions/integrations';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = {
  POSTED: 'ok', PENDING: 'info', PAID_UNPOSTED: 'bad', REVIEW: 'bad', FAILED: 'warn', CANCELLED: 'warn', TIMEOUT: 'warn',
};

export async function MpesaIntegrationTab({ filters }: { filters?: string } = {}) {
  await requireAction('INTEGRATIONS_MPESA_MANAGE');
  const [info, codes, allRecent] = await Promise.all([getMpesaSettingsInfo(), all<{ code: string; name: string }>("SELECT code, name FROM bank_account WHERE status = 'ACTIVE' ORDER BY code"), listRecentMpesaRequests()]);
  const recent = filterRows(allRecent, ADMIN_FIELDS['mpesa-requests'], parseFilters(filters));
  const attention = recent.filter((r) => r.status === 'PAID_UNPOSTED' || r.status === 'REVIEW').length;
  return (
    <>
      <MpesaSetupForm info={info} encryptionReady={fieldEncryptionStatus().ready} paymentCodes={codes.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} />
      <Card>
        <CardHead title="Recent M-Pesa prompts" sub={attention ? `${attention} paid prompt(s) need attention — the money arrived but did not post` : 'Every prompt sent to a client, and what came of it'} />
        <Toolbar><ListTools exportKey="mpesa-requests" fields={ADMIN_FIELDS['mpesa-requests']} filters={filters} count={recent.length} /></Toolbar>
        {recent.length ? (
          <TableWrap>
            <thead><tr><th>Sent</th><th>Client / invoice</th><th>Phone</th><th className="num">Amount</th><th>Status</th><th>Receipt</th><th>Result</th><th>By</th></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="tiny">{formatDateTime(r.requested_at)}</td>
                  <td>{r.customer_no ? <Link href={`/receivables/customers/${r.customer_no}`}>{r.customer_name}</Link> : '—'}{r.document_no ? <span className="mono tiny"> · {r.document_no}</span> : null}</td>
                  <td className="mono">{maskPhone(r.phone)}</td>
                  <td className="num"><Money cents={Number(r.amount)} /></td>
                  <td><Pill tone={TONE[r.status] ?? 'info'}>{humanise(r.status)}</Pill></td>
                  <td className="mono">{r.mpesa_receipt ?? '—'}</td>
                  <td className="tiny">{r.result_desc ?? ''}</td>
                  <td className="tiny">{r.requested_by}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : <EmptyState icon="📱" title="No M-Pesa prompts yet" sub="Once M-Pesa is on, finance sends one from a client's card or an open invoice." />}
      </Card>
    </>
  );
}

export async function EmailIntegrationTab() {
  const user = await requireAction('INTEGRATIONS_EMAIL_MANAGE');
  const info = await getMailSettingsInfo();
  return <MailSetupForm info={info} encryptionReady={fieldEncryptionStatus().ready} notifications={Object.entries(NOTIFICATIONS) as [NotificationKey, string][]} adminEmail={user.email ?? ''} />;
}

const ETIMS_TONE = { SIGNED: 'ok', PENDING: 'warn', FAILED: 'bad' } as const;

export async function EtimsIntegrationTab({ filters }: { filters?: string } = {}) {
  await requireAction('INTEGRATIONS_ETIMS_MANAGE');
  const [info, allQueue, counts] = await Promise.all([
    getEtimsSettingsInfo(), listEtimsInvoices('attention'),
    all<{ status: string; n: number }>('SELECT status, COUNT(*)::int AS n FROM etims_invoice GROUP BY status'),
  ]);
  const queue = filterRows(allQueue, ADMIN_FIELDS['etims-invoices'], parseFilters(filters));
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  return (
    <>
      <EtimsSetupForm info={info} encryptionReady={fieldEncryptionStatus().ready} />
      <Card>
        <CardHead title="Sales to KRA" sub={`${n('SIGNED')} signed · ${n('PENDING')} pending · ${n('FAILED')} refused — the job queue retries pending ones every few minutes`}>
          {info.enabled ? <RunButton label="Send pending now" className="btn sm ghost" action={submitEtimsNowRequest} successTitle="Sent to KRA" /> : null}
        </CardHead>
        <Toolbar><ListTools exportKey="etims-invoices" fields={ADMIN_FIELDS['etims-invoices']} filters={filters} count={queue.length} /></Toolbar>
        {queue.length ? (
          <TableWrap>
            <thead><tr><th>Queued</th><th>Sale</th><th>Invoice No.</th><th className="num">Total</th><th className="num">VAT</th><th>Status</th><th className="num">Attempts</th><th>Last error</th><th /></tr></thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.id}>
                  <td className="tiny">{formatDateTime(q.created_at)}</td>
                  <td className="mono"><a href={`/print/etims/${q.source_type}-${q.source_no}`} target="_blank" rel="noreferrer">{q.source_type === 'SALES_CREDIT_MEMO' ? 'Credit memo' : 'Invoice'} {q.source_no}</a></td>
                  <td className="mono">{q.invc_no ?? '—'}</td>
                  <td className="num"><Money cents={Number(q.total)} /></td><td className="num"><Money cents={Number(q.tax_total)} /></td>
                  <td><Pill tone={ETIMS_TONE[q.status]}>{q.status.toLowerCase()}</Pill></td>
                  <td className="num">{q.attempts}</td>
                  <td className="tiny">{q.last_error ?? ''}</td>
                  <td>{q.status === 'FAILED' ? <RunButton label="Retry" className="btn sm ghost" action={retryEtimsInvoiceRequest.bind(null, q.id)} successTitle="Sent to KRA again" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : <EmptyState icon="🧾" title="Nothing waiting" sub="Every reported sale has been signed by KRA." />}
      </Card>
    </>
  );
}
