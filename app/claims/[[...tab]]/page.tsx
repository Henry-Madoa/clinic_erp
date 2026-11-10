import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { listClaims, getClaim, claimCharges, claimsByScheme, listPreauths, type ClaimView } from '@/lib/clinic/claims';
import { listSchemes } from '@/lib/clinic/setup';
import { formatDate, formatDateTime, formatMoney, humanise } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, DefinitionList, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput, SelectFilter } from '@/components/ui/filters';
import { ModalFormButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { BulkTable } from '@/components/clinic/pickers';
import { submitClaimsRequest, decideClaimRequest, decidePreauthRequest } from '@/app/actions/clinic';
import type { InsuranceClaim } from '@/lib/types';

const TABS = [
  { key: 'draft', label: 'To submit' }, { key: 'submitted', label: 'Awaiting decision' }, { key: 'decided', label: 'Decided' },
  { key: 'preauth', label: 'Pre-authorisations' }, { key: 'payers', label: 'By payer' },
];

export default async function ClaimsPage({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ q?: string; scheme?: string }> }) {
  const user = await requireAction('CLAIMS_READ');
  const seg = (await params).tab;
  const { q = '', scheme } = await searchParams;
  if (seg?.[0] === 'view' && seg[1]) return <ClaimCard no={decodeURIComponent(seg[1])} />;
  const tab = seg?.[0] ?? 'draft';
  if (!TABS.some((t) => t.key === tab)) notFound();
  const canManage = canAction(user, 'CLAIMS_MANAGE');
  return (
    <Page title="Insurance Claims" crumb="Scheme shares of final bills — submit, record the payer’s decision, and the approved amount is invoiced to the payer in Receivables" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'draft' ? '/claims' : `/claims/${k}`)} />
      {tab === 'preauth' ? <Preauths canManage={canManage} /> : tab === 'payers' ? <Payers /> : <ClaimList view={tab as ClaimView} q={q} schemeId={scheme ? Number(scheme) : null} canManage={canManage} />}
    </Page>
  );
}

async function ClaimList({ view, q, schemeId, canManage }: { view: ClaimView; q: string; schemeId: number | null; canManage: boolean }) {
  const [rows, schemes] = await Promise.all([listClaims(view, q, schemeId), listSchemes()]);
  const total = rows.reduce((a, c) => a + Number(c.amount), 0);
  const cells = (c: InsuranceClaim) => [
    <Link key="n" className="mono" href={`/claims/view/${c.no}`}>{c.no}</Link>,
    <span key="p"><b>{c.patient_name}</b><div className="tiny muted-cell">{c.mrn} · member {c.member_no ?? '—'}</div></span>,
    <span key="s">{c.scheme_name}</span>, <span key="d" className="tiny">{formatDate(c.visit_date)}<div className="muted-cell">{c.visit_no}</div></span>,
    <span key="a" className="num">{formatMoney(c.amount)}</span>,
    <span key="g" className={`tiny ${(c.age_days ?? 0) > 30 ? 'danger-text' : ''}`}>{c.age_days} d</span>,
  ];
  return (
    <>
      <Toolbar>
        <SelectFilter paramName="scheme" label="Payer" allLabel="All payers" options={schemes.map((s) => ({ value: String(s.id), label: s.name }))} />
        <SearchInput placeholder="Claim, MRN, member no., batch…" />
        <Spacer /><span className="tiny muted-cell">{rows.length} claim(s) · {formatMoney(total)}</span>
      </Toolbar>
      <Card>
        {!rows.length ? <EmptyState icon="🏥" title="No claims here" /> : view === 'draft' && canManage ? (
          <BulkTable label="Submit to payer" successTitle="Claims submitted" action={submitClaimsRequest} extra={{ placeholder: 'Batch / covering letter ref (optional)' }}
            head={['Claim', 'Patient', 'Payer', 'Visit', 'Amount', 'Age']} rows={rows.map((c) => ({ key: c.no, cells: cells(c) }))} />
        ) : (
          <TableWrap>
            <thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th>Visit</th><th className="num">Claimed</th><th>Age</th><th>Batch</th>{view !== 'submitted' ? <><th className="num">Approved</th><th className="num">Paid</th></> : null}<th>Status</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}>{cells(c).map((x, i) => <td key={i} className={i === 4 ? 'num' : undefined}>{x}</td>)}
                <td className="mono tiny">{c.batch_ref ?? '—'}</td>
                {view !== 'submitted' ? <><td className="num">{c.approved_amount != null ? formatMoney(c.approved_amount) : '—'}</td><td className="num">{formatMoney(c.paid_amount ?? 0)}</td></> : null}
                <td><Pill status={c.status} /></td>
                <td>{canManage && (c.status === 'SUBMITTED' || c.status === 'DRAFT') ? <DecideButton c={c} /> : <Link className="btn sm ghost" href={`/claims/view/${c.no}`}>Open</Link>}</td></tr>
            ))}</tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

function DecideButton({ c }: { c: InsuranceClaim }) {
  return (
    <ModalFormButton label="Record decision" className="btn sm" title={`${c.no} — payer's decision`} action={decideClaimRequest.bind(null, c.no)} submitLabel="Record" successTitle="Decision recorded">
      <p>Claimed {formatMoney(c.amount)} from {c.scheme_name}. Approving invoices the payer; anything not approved is written off.</p>
      <div className="grid g2">
        <Field name="decision" label="Decision" type="select" required defaultValue="APPROVED" options={[{ value: 'APPROVED', label: 'Approved in full' }, { value: 'PARTIAL', label: 'Partly approved' }, { value: 'REJECTED', label: 'Rejected' }]} />
        <Field name="approved_amount" label="Approved amount (partial only)" type="currency" />
      </div>
      <Field name="rejection_reason" label="Payer's reason (partial / rejected)" maxLength={500} />
    </ModalFormButton>
  );
}

async function ClaimCard({ no }: { no: string }) {
  const user = await requireAction('CLAIMS_READ');
  const c = await getClaim(no);
  if (!c) notFound();
  const lines = await claimCharges(c.id);
  return (
    <Page title={`Claim ${c.no}`} crumb={`${c.scheme_name} · ${c.patient_name} · visit ${c.visit_no}`} user={user}>
      <Toolbar>
        <Link className="btn ghost sm" href="/claims">← Claims</Link>
        <Link className="btn ghost sm" target="_blank" href={`/clinic-print/claim/${c.no}`}>Print claim form</Link>
        {c.invoice_no ? <Link className="btn ghost sm" href={`/receivables/posted/${c.invoice_no}`}>Invoice {c.invoice_no}</Link> : null}
        <Spacer />
        {canAction(user, 'CLAIMS_MANAGE') && (c.status === 'SUBMITTED' || c.status === 'DRAFT') ? <DecideButton c={c} /> : null}
      </Toolbar>
      <div className="grid g4 stack-2">
        <Stat label="Claimed" value={formatMoney(c.amount)} />
        <Stat accent={false} label="Approved" value={c.approved_amount != null ? formatMoney(c.approved_amount) : '—'} />
        <Stat accent={false} label="Paid by payer" value={formatMoney(c.paid_amount ?? 0)} />
        <Stat accent={false} label="Status" value={humanise(c.status)} small foot={`${c.age_days} days old`} />
      </div>
      <Card>
        <div className="grid g2">
          <DefinitionList items={[['Patient', <Link key="p" href={`/patients/${c.mrn}`}>{c.patient_name} ({c.mrn})</Link>], ['Member no.', c.member_no ?? '—'], ['Pre-authorisation', c.preauth_no ?? '—'], ['Visit', <Link key="v" href={`/visits/${c.visit_no}/billing`}>{c.visit_no} · {formatDate(c.visit_date)}</Link>], ['Bill', c.bill_no]]} />
          <DefinitionList items={[['Raised', `${formatDateTime(c.created_at)} by ${c.created_by}`], ['Submitted', c.submitted_at ? `${formatDateTime(c.submitted_at)} · batch ${c.batch_ref ?? '—'}` : '—'],
            ['Decided', c.decided_at ? `${formatDateTime(c.decided_at)} by ${c.decided_by}` : '—'], c.rejection_reason ? ['Payer\'s reason', c.rejection_reason] : null]} />
        </div>
      </Card>
      <Card>
        <CardHead title="Services claimed" />
        <TableWrap><thead><tr><th>Date</th><th>Code</th><th>Service</th><th className="num">Qty</th><th className="num">Amount</th><th className="num">Scheme pays</th></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={i}><td className="tiny">{formatDate(l.charged_at)}</td><td className="mono tiny">{l.service_code ?? ''}</td><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{formatMoney(l.amount - l.discount)}</td><td className="num">{formatMoney(l.scheme_amount)}</td></tr>)}</tbody></TableWrap>
      </Card>
    </Page>
  );
}

async function Preauths({ canManage }: { canManage: boolean }) {
  const [open, decided] = await Promise.all([listPreauths('REQUESTED'), listPreauths('DECIDED')]);
  const table = (rows: typeof open, actions: boolean) => (
    <TableWrap><thead><tr><th>No.</th><th>Patient</th><th>Payer</th><th>For</th><th className="num">Requested</th><th className="num">Approved</th><th>Code</th><th>Status</th>{actions ? <th /> : null}</tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p.id}><td className="mono">{p.no}</td><td>{p.patient_name}<div className="tiny muted-cell">{p.mrn}{p.visit_no ? ` · ${p.visit_no}` : ''}</div></td><td className="tiny">{p.scheme_name}</td><td>{p.description}</td>
          <td className="num">{formatMoney(p.requested_amount)}</td><td className="num">{p.approved_amount != null ? formatMoney(p.approved_amount) : '—'}</td><td className="mono">{p.auth_code ?? '—'}</td><td><Pill status={p.status} /></td>
          {actions ? <td>{canManage ? (
            <ModalFormButton label="Record decision" className="btn sm" title={`${p.no} — decision`} action={decidePreauthRequest.bind(null, p.no)} successTitle="Recorded">
              <div className="grid g3">
                <Field name="decision" label="Decision" type="select" required defaultValue="APPROVED" options={[{ value: 'APPROVED', label: 'Approved' }, { value: 'DECLINED', label: 'Declined' }]} />
                <Field name="auth_code" label="Authorisation code" maxLength={40} />
                <Field name="approved_amount" label="Approved amount" type="currency" />
              </div>
              <Field name="notes" label="Notes" maxLength={1000} />
            </ModalFormButton>
          ) : null}</td> : null}</tr>
      ))}</tbody></TableWrap>
  );
  return (
    <>
      <Card><CardHead title="Awaiting the payer" sub="Requested from the visit’s Orders tab" />{open.length ? table(open, true) : <EmptyState icon="🔏" title="None pending" />}</Card>
      <Card><CardHead title="Decided — last 60 days" />{decided.length ? table(decided, false) : <EmptyState icon="🔏" title="None" />}</Card>
    </>
  );
}

async function Payers() {
  const rows = await claimsByScheme();
  const sum = (k: 'draft' | 'submitted' | 'approved_unpaid') => rows.reduce((a, r) => a + Number(r[k]), 0);
  return (
    <>
      <div className="grid g3 stack-2">
        <Stat label="Not yet submitted" value={formatMoney(sum('draft'))} />
        <Stat accent={false} label="With payers for decision" value={formatMoney(sum('submitted'))} />
        <Stat accent={false} label="Approved, unpaid (Receivables)" value={formatMoney(sum('approved_unpaid'))} />
      </div>
      <Card>
        {rows.length ? <TableWrap><thead><tr><th>Payer</th><th className="num">To submit</th><th className="num">Awaiting decision</th><th className="num">Approved unpaid</th><th className="num">Past submission deadline</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.scheme_id}><td>{r.scheme_name}</td><td className="num">{formatMoney(r.draft)}</td><td className="num">{formatMoney(r.submitted)}</td><td className="num">{formatMoney(r.approved_unpaid)}</td>
            <td className={`num ${r.overdue ? 'danger-text' : ''}`}>{r.overdue}</td><td><Link className="btn sm ghost" href={`/claims?scheme=${r.scheme_id}`}>Claims</Link></td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="🏥" title="No claims yet" />}
      </Card>
    </>
  );
}
