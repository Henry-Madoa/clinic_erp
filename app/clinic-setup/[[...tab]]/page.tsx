import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { all } from '@/lib/db';
import * as S from '@/lib/clinic/setup';
import { formatMoney, humanise } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, DefinitionList, EmptyState, Pill, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput, SelectFilter } from '@/components/ui/filters';
import { EditableCard } from '@/components/ui/editable-card';
import { InlineEditForm } from '@/components/ui/inline-edit-form';
import { ModalFormButton, RunButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import {
  saveClinicSetupRequest, saveDepartmentRequest, saveServiceItemRequest, savePriceListRequest, setPriceRequest, saveSchemeRequest,
  saveLabTestRequest, saveLabParameterRequest, deleteLabParameterRequest, saveDrugRequest, addIcdRequest,
} from '@/app/actions/clinic';
import type { ClinicDepartment, InsuranceScheme, ServiceItem, Drug, LabTest, LabTestParameter, SessionUser } from '@/lib/types';

const TABS = [
  { key: 'general', label: 'General & posting' }, { key: 'departments', label: 'Clinics & service points' }, { key: 'services', label: 'Charge master' },
  { key: 'prices', label: 'Tariffs' }, { key: 'payers', label: 'Payers' }, { key: 'lab', label: 'Lab catalogue' }, { key: 'drugs', label: 'Formulary' }, { key: 'icd', label: 'ICD-10' },
];
const opt = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: humanise(x) }));

export default async function ClinicSetupPage({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ q?: string; kind?: string; list?: string }> }) {
  const user = await requireAction('CLINIC_SETUP_READ');
  const seg = (await params).tab;
  const sp = await searchParams;
  const tab = seg?.[0] ?? 'general';
  if (!TABS.some((t) => t.key === tab)) notFound();
  const canManage = canAction(user, 'CLINIC_SETUP_MANAGE');
  return (
    <Page title="Clinic Setup" crumb="Departments, the charge master and tariffs, payers, the lab catalogue and the formulary" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'general' ? '/clinic-setup' : `/clinic-setup/${k}`)} />
      {tab === 'general' ? <General canManage={canManage} /> : null}
      {tab === 'departments' ? <Departments canManage={canManage} /> : null}
      {tab === 'services' ? <Services user={user} q={sp.q ?? ''} kind={sp.kind ?? ''} /> : null}
      {tab === 'prices' ? <Prices user={user} list={sp.list} /> : null}
      {tab === 'payers' ? <Payers canManage={canManage} /> : null}
      {tab === 'lab' ? (seg?.[1] ? <LabTestCard id={Number(seg[1])} canManage={canManage} /> : <Lab canManage={canManage} />) : null}
      {tab === 'drugs' ? <Drugs canManage={canManage} q={sp.q ?? ''} /> : null}
      {tab === 'icd' ? <Icd canManage={canManage} /> : null}
    </Page>
  );
}

/* ------------------------------------------------------------------ general */

async function General({ canManage }: { canManage: boolean }) {
  const [s, accounts, banks, locations, lists, services] = await Promise.all([
    S.getClinicSetup(), all<{ id: number; code: string; name: string }>("SELECT id, code, name FROM gl_account WHERE is_postable = 1 AND status = 'ACTIVE' ORDER BY code"),
    all<{ id: number; code: string; name: string }>("SELECT id, code, name FROM bank_account WHERE status = 'ACTIVE' ORDER BY name"),
    all<{ id: number; code: string; name: string }>("SELECT id, code, name FROM location WHERE status = 'ACTIVE' ORDER BY name"),
    S.listPriceLists(), S.listServiceItems({ kind: 'REGISTRATION', activeOnly: true }),
  ]);
  const accOpts = [{ value: '', label: '—' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))];
  const bankOpts = [{ value: '', label: '—' }, ...banks.map((b) => ({ value: b.id, label: b.name }))];
  const name = (rows: { id: number; code: string; name: string }[], id: number | null) => { const r = rows.find((x) => x.id === id); return r ? `${r.code} ${r.name}` : '—'; };
  return (
    <EditableCard title="Clinic Setup" sub="How bills post, where receipts go, and the clinical policies" canEdit={canManage}
      form={canManage ? (
        <InlineEditForm action={saveClinicSetupRequest} successTitle="Clinic Setup saved">
          <div className="section-title">Posting accounts</div>
          <div className="grid g3">
            <Field name="patient_receivable_account_id" label="Patient receivables" type="select" defaultValue={s.patient_receivable_account_id ?? ''} options={accOpts} />
            <Field name="unbilled_claims_account_id" label="Unbilled insurance claims" type="select" defaultValue={s.unbilled_claims_account_id ?? ''} options={accOpts} />
            <Field name="discount_account_id" label="Discounts & waivers" type="select" defaultValue={s.discount_account_id ?? ''} options={accOpts} />
            <Field name="claim_writeoff_account_id" label="Claim rejections written off" type="select" defaultValue={s.claim_writeoff_account_id ?? ''} options={accOpts} />
            <Field name="default_revenue_account_id" label="Default revenue" type="select" defaultValue={s.default_revenue_account_id ?? ''} options={accOpts} />
            <Field name="pharmacy_location_id" label="Pharmacy store" type="select" defaultValue={s.pharmacy_location_id ?? ''} options={[{ value: '', label: '—' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
          </div>
          <div className="section-title">Cashier receiving accounts</div>
          <div className="grid g4">
            <Field name="cash_bank_account_id" label="Cash" type="select" defaultValue={s.cash_bank_account_id ?? ''} options={bankOpts} />
            <Field name="mpesa_bank_account_id" label="M-Pesa" type="select" defaultValue={s.mpesa_bank_account_id ?? ''} options={bankOpts} />
            <Field name="card_bank_account_id" label="Card" type="select" defaultValue={s.card_bank_account_id ?? ''} options={bankOpts} />
            <Field name="bank_transfer_account_id" label="Bank transfer" type="select" defaultValue={s.bank_transfer_account_id ?? ''} options={bankOpts} />
          </div>
          <div className="section-title">Policies</div>
          <div className="grid g4">
            <Field name="default_price_list_code" label="Cash tariff" type="select" defaultValue={s.default_price_list_code} options={lists.map((l) => ({ value: l.code, label: l.name }))} />
            <Field name="registration_service_code" label="Registration fee (first visit)" type="select" defaultValue={s.registration_service_code ?? ''} options={[{ value: '', label: 'None' }, ...services.map((x) => ({ value: x.code, label: `${x.name} — ${formatMoney(x.base_price)}` }))]} />
            <Field name="review_window_days" label="Free review within (days)" type="number" min={0} max={90} defaultValue={s.review_window_days} />
            <Field name="reminder_hours" label="SMS reminder ahead (hours)" type="number" min={1} max={168} defaultValue={s.reminder_hours} />
          </div>
          <div className="grid g4">
            <Field name="day_start" label="Bookings from" type="time" defaultValue={s.day_start} />
            <Field name="day_end" label="Bookings until" type="time" defaultValue={s.day_end} />
            <Field name="slot_minutes" label="Slot (minutes)" type="number" min={5} max={120} defaultValue={s.slot_minutes} />
            <div />
          </div>
          <Field name="pay_before_service" label="Cash patients settle earlier charges before drugs are dispensed" type="checkbox" defaultValue={s.pay_before_service} />
          <Field name="lab_requires_verification" label="Lab results need a second person to verify before release" type="checkbox" defaultValue={s.lab_requires_verification} />
        </InlineEditForm>
      ) : null}>
      <div className="grid g3">
        <DefinitionList items={[
          ['Patient receivables', name(accounts, s.patient_receivable_account_id)], ['Unbilled claims', name(accounts, s.unbilled_claims_account_id)],
          ['Discounts', name(accounts, s.discount_account_id)], ['Claim write-offs', name(accounts, s.claim_writeoff_account_id)], ['Default revenue', name(accounts, s.default_revenue_account_id)],
        ]} />
        <DefinitionList items={[
          ['Cash', name(banks, s.cash_bank_account_id)], ['M-Pesa', name(banks, s.mpesa_bank_account_id)], ['Card', name(banks, s.card_bank_account_id)],
          ['Bank transfer', name(banks, s.bank_transfer_account_id)], ['Pharmacy store', name(locations, s.pharmacy_location_id)],
        ]} />
        <DefinitionList items={[
          ['Cash tariff', s.default_price_list_code], ['Registration fee', s.registration_service_code ?? 'None'], ['Free review window', `${s.review_window_days} days`],
          ['Bookings', `${s.day_start}–${s.day_end}, ${s.slot_minutes}-min slots`], ['Pay before service', s.pay_before_service ? 'Yes' : 'No'], ['Lab verification', s.lab_requires_verification ? 'Second person' : 'Released on entry'],
        ]} />
      </div>
    </EditableCard>
  );
}

/* ------------------------------------------------------------------ departments */

async function DepartmentFields({ d }: { d?: ClinicDepartment }) {
  const consults = await S.listServiceItems({ kind: 'CONSULTATION', activeOnly: true });
  return (
    <>
      <div className="grid g3">
        {d ? null : <Field name="code" label="Code" required maxLength={12} uppercase />}
        <Field name="name" label="Name" required maxLength={80} defaultValue={d?.name} />
        <Field name="kind" label="Kind" type="select" defaultValue={d?.kind ?? 'CLINIC'} options={[{ value: 'CLINIC', label: 'Clinic (sees patients)' }, { value: 'SERVICE', label: 'Service point' }]} />
      </div>
      <div className="grid g4">
        <Field name="queue_prefix" label="Queue prefix" required maxLength={4} defaultValue={d?.queue_prefix ?? ''} uppercase />
        <Field name="room" label="Room" maxLength={40} defaultValue={d?.room ?? ''} />
        <Field name="colour" label="Colour" maxLength={7} defaultValue={d?.colour ?? '#0F766E'} />
        <Field name="sort_order" label="Order" type="number" defaultValue={d?.sort_order ?? 0} />
      </div>
      <div className="grid g2">
        <Field name="consultation_service_code" label="Consultation fee on check-in" type="select" defaultValue={d?.consultation_service_code ?? ''} options={[{ value: '', label: 'None' }, ...consults.map((c) => ({ value: c.code, label: `${c.name} — ${formatMoney(c.base_price)}` }))]} />
        <Field name="status" label="Status" type="select" defaultValue={d?.status ?? 'ACTIVE'} options={opt(['ACTIVE', 'INACTIVE'])} />
      </div>
    </>
  );
}

async function Departments({ canManage }: { canManage: boolean }) {
  const rows = await S.listDepartments();
  return (
    <Card>
      <CardHead title="Clinics & service points" sub="Each keeps its own queue (prefix + daily number)">
        {canManage ? <ModalFormButton label="New" className="btn sm" title="New clinic / service point" action={saveDepartmentRequest.bind(null, null)} successTitle="Created"><DepartmentFields /></ModalFormButton> : null}
      </CardHead>
      <TableWrap><thead><tr><th>Code</th><th>Name</th><th>Kind</th><th>Queue</th><th>Room</th><th>Consultation fee</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((d) => (
          <tr key={d.code}><td className="mono"><span style={{ borderLeft: `4px solid ${d.colour}`, paddingLeft: 6 }}>{d.code}</span></td><td>{d.name}</td><td>{humanise(d.kind)}</td><td className="mono">{d.queue_prefix}-001</td><td>{d.room ?? '—'}</td>
            <td className="mono tiny">{d.consultation_service_code ?? '—'}</td><td><Pill status={d.status} /></td>
            <td>{canManage ? <ModalFormButton label="Edit" className="btn sm ghost" title={`Edit ${d.name}`} action={saveDepartmentRequest.bind(null, d.code)} successTitle="Saved"><DepartmentFields d={d} /></ModalFormButton> : null}</td></tr>
        ))}</tbody></TableWrap>
    </Card>
  );
}

/* ------------------------------------------------------------------ charge master */

async function ServiceFields({ s }: { s?: ServiceItem }) {
  const [cats, depts] = await Promise.all([S.listServiceCategories(), S.listDepartments(true)]);
  return (
    <>
      <div className="grid g3">
        {s ? null : <Field name="code" label="Code" required maxLength={30} uppercase />}
        <Field name="name" label="Name" required maxLength={120} defaultValue={s?.name} />
        <Field name="base_price" label="Base (cash) price" type="currency" required defaultValue={s ? (Number(s.base_price) / 100).toFixed(2) : ''} />
      </div>
      <div className="grid g4">
        <Field name="kind" label="Kind" type="select" defaultValue={s?.kind ?? 'PROCEDURE'} options={opt(S.SERVICE_KINDS)} />
        <Field name="category_code" label="Revenue category" type="select" required defaultValue={s?.category_code ?? ''} options={cats.map((c) => ({ value: c.code, label: `${c.name}${c.revenue_account_code ? ` (${c.revenue_account_code})` : ''}` }))} />
        <Field name="department_code" label="Department" type="select" defaultValue={s?.department_code ?? ''} options={[{ value: '', label: '—' }, ...depts.map((d) => ({ value: d.code, label: d.name }))]} />
        <Field name="vat_prod_posting_group_code" label="VAT" type="select" defaultValue={s?.vat_prod_posting_group_code ?? 'EXEMPT'} options={[{ value: 'EXEMPT', label: 'Exempt (medical services)' }, { value: 'VAT16', label: 'VAT 16%' }, { value: 'VAT0', label: 'Zero-rated' }]} />
      </div>
      <div className="grid g2">
        <Field name="requires_preauth" label="Needs payer pre-authorisation" type="checkbox" defaultValue={s?.requires_preauth ?? 0} />
        <Field name="status" label="Status" type="select" defaultValue={s?.status ?? 'ACTIVE'} options={opt(['ACTIVE', 'INACTIVE'])} />
      </div>
      <Field name="description" label="Description" maxLength={500} defaultValue={s?.description ?? ''} />
    </>
  );
}

async function Services({ user, q, kind }: { user: SessionUser; q: string; kind: string }) {
  const rows = await S.listServiceItems({ q, kind });
  const canPrice = canAction(user, 'CLINIC_PRICES_MANAGE');
  return (
    <>
      <Toolbar>
        <SelectFilter paramName="kind" label="Kind" allLabel="All kinds" options={opt(S.SERVICE_KINDS)} />
        <SearchInput placeholder="Code or name…" />
        <Spacer />
        {canPrice ? <ModalFormButton label="New service" wide title="New service" action={saveServiceItemRequest.bind(null, null)} successTitle="Service created"><ServiceFields /></ModalFormButton> : null}
      </Toolbar>
      <Card>
        <TableWrap><thead><tr><th>Code</th><th>Service</th><th>Kind</th><th>Category</th><th>Dept</th><th className="num">Base price</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}><td className="mono">{s.code}</td><td>{s.name}{s.requires_preauth ? <span className="tiny warn-text"> · pre-auth</span> : null}</td><td>{humanise(s.kind)}</td><td className="tiny">{s.category_name}</td>
              <td className="tiny">{s.department_code ?? '—'}</td><td className="num">{formatMoney(s.base_price)}</td><td><Pill status={s.status} /></td>
              <td>{canPrice && s.kind !== 'DRUG' && s.kind !== 'LAB' ? <ModalFormButton label="Edit" className="btn sm ghost" wide title={`Edit ${s.code}`} action={saveServiceItemRequest.bind(null, s.code)} successTitle="Saved"><ServiceFields s={s} /></ModalFormButton>
                : <span className="tiny muted-cell">{s.kind === 'DRUG' ? 'via Formulary' : s.kind === 'LAB' ? 'via Lab catalogue' : ''}</span>}</td></tr>
          ))}</tbody></TableWrap>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ tariffs */

async function Prices({ user, list }: { user: SessionUser; list?: string }) {
  const lists = await S.listPriceLists();
  const current = list ?? lists[0]?.code;
  const matrix = current ? await S.priceListMatrix(current) : [];
  const canPrice = canAction(user, 'CLINIC_PRICES_MANAGE');
  const plFields = (p?: (typeof lists)[number]) => (
    <>
      <div className="grid g3">
        {p ? null : <Field name="code" label="Code" required maxLength={20} uppercase />}
        <Field name="name" label="Name" required maxLength={80} defaultValue={p?.name} />
        <Field name="kind" label="Kind" type="select" defaultValue={p?.kind ?? 'INSURANCE'} options={opt(['CASH', 'INSURANCE', 'CORPORATE', 'STAFF'])} />
      </div>
      <div className="grid g2">
        <Field name="markup_pct" label="Markup on base price for services without a line (%)" type="number" step="0.01" defaultValue={p?.markup_pct ?? 0} />
        <Field name="status" label="Status" type="select" defaultValue={p?.status ?? 'ACTIVE'} options={opt(['ACTIVE', 'INACTIVE'])} />
      </div>
    </>
  );
  const cur = lists.find((l) => l.code === current);
  return (
    <>
      <Toolbar>
        {lists.map((l) => <Link key={l.code} className={`btn sm ${l.code === current ? '' : 'ghost'}`} href={`/clinic-setup/prices?list=${l.code}`}>{l.name}</Link>)}
        <Spacer />
        {canPrice ? <ModalFormButton label="New tariff" className="btn sm" title="New price list" action={savePriceListRequest.bind(null, null)} successTitle="Tariff created">{plFields()}</ModalFormButton> : null}
      </Toolbar>
      {cur ? (
        <Card>
          <CardHead title={cur.name} sub={`${humanise(cur.kind)} · ${cur.lines} negotiated line(s) · otherwise base price ${cur.markup_pct >= 0 ? '+' : ''}${cur.markup_pct}%`}>
            {canPrice ? <ModalFormButton label="Edit tariff" className="btn sm ghost" title={`Edit ${cur.name}`} action={savePriceListRequest.bind(null, cur.code)} successTitle="Saved">{plFields(cur)}</ModalFormButton> : null}
          </CardHead>
          <TableWrap><thead><tr><th>Code</th><th>Service</th><th>Kind</th><th className="num">Base</th><th className="num">Negotiated</th><th className="num">Effective</th><th /></tr></thead>
            <tbody>{matrix.map((m) => (
              <tr key={m.id}><td className="mono">{m.code}</td><td>{m.name}</td><td className="tiny">{humanise(m.kind)}</td><td className="num">{formatMoney(m.base_price)}</td>
                <td className="num">{m.list_price != null ? formatMoney(m.list_price) : <span className="muted-cell">—</span>}</td><td className="num"><b>{formatMoney(m.effective)}</b></td>
                <td>{canPrice ? (
                  <ModalFormButton label="Set" className="btn sm ghost" title={`${m.name} on ${cur.name}`} action={setPriceRequest.bind(null, cur.code, m.id)} successTitle="Price set">
                    <Field name="price" label="Price on this tariff (blank = remove the line)" type="currency" defaultValue={m.list_price != null ? (Number(m.list_price) / 100).toFixed(2) : ''} />
                  </ModalFormButton>
                ) : null}</td></tr>
            ))}</tbody></TableWrap>
        </Card>
      ) : <Card><EmptyState icon="💲" title="No tariffs" /></Card>}
    </>
  );
}

/* ------------------------------------------------------------------ payers */

async function SchemeFields({ s }: { s?: InsuranceScheme }) {
  const lists = await S.listPriceLists();
  return (
    <>
      <div className="grid g3">
        {s ? null : <Field name="code" label="Code" required maxLength={20} uppercase />}
        <Field name="name" label="Name" required maxLength={120} defaultValue={s?.name} />
        <Field name="payer_type" label="Payer type" type="select" defaultValue={s?.payer_type ?? 'INSURER'} options={opt(S.PAYER_TYPES)} />
      </div>
      <div className="grid g4">
        <Field name="price_list_code" label="Tariff" type="select" defaultValue={s?.price_list_code ?? ''} options={[{ value: '', label: 'Cash tariff' }, ...lists.map((l) => ({ value: l.code, label: l.name }))]} />
        <Field name="copay_type" label="Co-pay" type="select" defaultValue={s?.copay_type ?? 'NONE'} options={opt(S.COPAY_TYPES)} />
        <Field name="copay_value" label="Co-pay (KSh or %)" type="number" step="0.01" defaultValue={s ? (s.copay_type === 'FIXED' ? Number(s.copay_value) / 100 : s.copay_value) : 0} />
        <Field name="claim_submission_days" label="Submit claims within (days)" type="number" defaultValue={s?.claim_submission_days ?? 30} />
      </div>
      <div className="grid g2">
        <Field name="visit_limit" label="Per-visit limit (0 = none)" type="currency" defaultValue={s ? (Number(s.visit_limit) / 100).toFixed(2) : ''} />
        <Field name="preauth_threshold" label="Pre-authorise above (0 = never)" type="currency" defaultValue={s ? (Number(s.preauth_threshold) / 100).toFixed(2) : ''} />
      </div>
      <div className="grid g3">
        <Field name="contact_name" label="Claims contact" maxLength={80} defaultValue={s?.contact_name ?? ''} />
        <Field name="contact_email" label="Claims e-mail" type="email" maxLength={120} defaultValue={s?.contact_email ?? ''} />
        <Field name="contact_phone" label="Phone" type="phone" maxLength={40} defaultValue={s?.contact_phone ?? ''} />
      </div>
      <div className="grid g2">
        <Field name="status" label="Status" type="select" defaultValue={s?.status ?? 'ACTIVE'} options={opt(['ACTIVE', 'INACTIVE'])} />
        <Field name="notes" label="Notes" maxLength={1000} defaultValue={s?.notes ?? ''} />
      </div>
    </>
  );
}

async function Payers({ canManage }: { canManage: boolean }) {
  const rows = await S.listSchemes();
  return (
    <Card>
      <CardHead title="Payers" sub="Insurers, SHA and employers — each billed through its own Receivables customer">
        {canManage ? <ModalFormButton label="New payer" className="btn sm" wide title="New payer" action={saveSchemeRequest.bind(null, null)} successTitle="Payer created (with its Receivables customer)"><SchemeFields /></ModalFormButton> : null}
      </CardHead>
      <TableWrap><thead><tr><th>Code</th><th>Payer</th><th>Type</th><th>Tariff</th><th>Co-pay</th><th className="num">Visit limit</th><th>Customer</th><th className="num">Owes us</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id}><td className="mono">{s.code}</td><td>{s.name}</td><td>{humanise(s.payer_type)}</td><td className="tiny">{s.price_list_code ?? 'Cash'}</td>
            <td className="tiny">{s.copay_type === 'NONE' ? '—' : s.copay_type === 'PERCENT' ? `${s.copay_value}%` : formatMoney(s.copay_value)}</td>
            <td className="num">{Number(s.visit_limit) ? formatMoney(s.visit_limit) : '—'}</td>
            <td className="mono">{s.customer_no ? <Link href={`/receivables/customers/${s.customer_no}`}>{s.customer_no}</Link> : '—'}</td>
            <td className="num">{formatMoney(s.customer_balance ?? 0)}</td><td><Pill status={s.status} /></td>
            <td>{canManage ? <ModalFormButton label="Edit" className="btn sm ghost" wide title={`Edit ${s.name}`} action={saveSchemeRequest.bind(null, s.id)} successTitle="Saved"><SchemeFields s={s} /></ModalFormButton> : null}</td></tr>
        ))}</tbody></TableWrap>
    </Card>
  );
}

/* ------------------------------------------------------------------ lab catalogue */

function LabTestFields({ t, price }: { t?: LabTest; price?: number }) {
  return (
    <>
      <div className="grid g3">
        {t ? null : <Field name="code" label="Code" required maxLength={20} uppercase />}
        <Field name="name" label="Name" required maxLength={120} defaultValue={t?.name} />
        <Field name="price" label="Price" type="currency" defaultValue={price != null ? (price / 100).toFixed(2) : ''} />
      </div>
      <div className="grid g4">
        <Field name="section" label="Section" type="select" defaultValue={t?.section ?? 'HAEMATOLOGY'} options={opt(S.LAB_SECTIONS)} />
        <Field name="specimen_type" label="Specimen" type="select" defaultValue={t?.specimen_type ?? 'BLOOD'} options={opt(S.SPECIMEN_TYPES)} />
        <Field name="container" label="Container" maxLength={60} defaultValue={t?.container ?? ''} />
        <Field name="tat_minutes" label="Turnaround target (min)" type="number" defaultValue={t?.tat_minutes ?? 60} />
      </div>
      <div className="grid g2">
        <Field name="method" label="Method" maxLength={80} defaultValue={t?.method ?? ''} />
        <Field name="status" label="Status" type="select" defaultValue={t?.status ?? 'ACTIVE'} options={opt(['ACTIVE', 'INACTIVE'])} />
      </div>
    </>
  );
}

async function Lab({ canManage }: { canManage: boolean }) {
  const tests = await S.listLabTests();
  return (
    <Card>
      <CardHead title="Lab tests" sub="Each test has its parameters, units and reference ranges (male / female), and critical limits">
        {canManage ? <ModalFormButton label="New test" className="btn sm" wide title="New lab test" action={saveLabTestRequest.bind(null, null)} successTitle="Test created"><LabTestFields /></ModalFormButton> : null}
      </CardHead>
      <TableWrap><thead><tr><th>Code</th><th>Test</th><th>Section</th><th>Specimen</th><th className="num">TAT</th><th className="num">Parameters</th><th className="num">Price</th><th>Status</th></tr></thead>
        <tbody>{tests.map((t) => (
          <tr key={t.id}><td className="mono"><Link href={`/clinic-setup/lab/${t.id}`}>{t.code}</Link></td><td><Link href={`/clinic-setup/lab/${t.id}`}>{t.name}</Link></td><td className="tiny">{humanise(t.section)}</td>
            <td className="tiny">{humanise(t.specimen_type)}</td><td className="num">{t.tat_minutes}m</td><td className="num">{t.parameters}</td><td className="num">{formatMoney(t.price ?? 0)}</td><td><Pill status={t.status} /></td></tr>
        ))}</tbody></TableWrap>
    </Card>
  );
}

function ParamFields({ p }: { p?: LabTestParameter }) {
  const n = (v: number | null | undefined) => (v == null ? '' : v);
  return (
    <>
      <div className="grid g4">
        <Field name="name" label="Parameter" required maxLength={80} defaultValue={p?.name} />
        <Field name="unit" label="Unit" maxLength={20} defaultValue={p?.unit ?? ''} />
        <Field name="result_type" label="Result type" type="select" defaultValue={p?.result_type ?? 'NUMERIC'} options={opt(['NUMERIC', 'TEXT', 'OPTION'])} />
        <Field name="sort_order" label="Order" type="number" defaultValue={p?.sort_order ?? 0} />
      </div>
      <Field name="options" label="Options (OPTION type — comma-separated, normal first)" maxLength={300} defaultValue={p?.options ?? ''} placeholder="Negative, Positive" />
      <div className="grid g4">
        <Field name="ref_low" label="Ref. low" type="number" step="any" defaultValue={n(p?.ref_low)} />
        <Field name="ref_high" label="Ref. high" type="number" step="any" defaultValue={n(p?.ref_high)} />
        <Field name="ref_low_female" label="Female low" type="number" step="any" defaultValue={n(p?.ref_low_female)} />
        <Field name="ref_high_female" label="Female high" type="number" step="any" defaultValue={n(p?.ref_high_female)} />
      </div>
      <div className="grid g3">
        <Field name="critical_low" label="Critical low" type="number" step="any" defaultValue={n(p?.critical_low)} />
        <Field name="critical_high" label="Critical high" type="number" step="any" defaultValue={n(p?.critical_high)} />
        <Field name="ref_text" label="Reference text (overrides)" maxLength={120} defaultValue={p?.ref_text ?? ''} />
      </div>
    </>
  );
}

async function LabTestCard({ id, canManage }: { id: number; canManage: boolean }) {
  const t = await S.getLabTest(id);
  if (!t) notFound();
  const [params, tests] = await Promise.all([S.listLabParameters(id), S.listLabTests()]);
  const price = tests.find((x) => x.id === id)?.price ?? 0;
  return (
    <>
      <Toolbar><Link className="btn ghost sm" href="/clinic-setup/lab">← Lab catalogue</Link></Toolbar>
      <EditableCard title={`${t.code} — ${t.name}`} sub={`${humanise(t.section)} · ${humanise(t.specimen_type)} · ${formatMoney(price)}`} canEdit={canManage}
        form={canManage ? <InlineEditForm action={saveLabTestRequest.bind(null, id)} successTitle="Saved"><LabTestFields t={t} price={price} /></InlineEditForm> : null}>
        <DefinitionList items={[['Container', t.container ?? '—'], ['Method', t.method ?? '—'], ['Turnaround target', `${t.tat_minutes} minutes`], ['Status', <Pill key="s" status={t.status} />]]} />
      </EditableCard>
      <Card>
        <CardHead title="Parameters & reference ranges">
          {canManage ? <ModalFormButton label="Add parameter" className="btn sm" wide title="New parameter" action={saveLabParameterRequest.bind(null, id, null)} successTitle="Added"><ParamFields /></ModalFormButton> : null}
        </CardHead>
        {params.length ? <TableWrap><thead><tr><th>#</th><th>Parameter</th><th>Unit</th><th>Type</th><th>Reference (M / F)</th><th>Critical</th><th /></tr></thead>
          <tbody>{params.map((p) => (
            <tr key={p.id}><td>{p.sort_order}</td><td>{p.name}</td><td>{p.unit ?? ''}</td><td className="tiny">{humanise(p.result_type)}{p.options ? ` (${p.options})` : ''}</td>
              <td className="tiny">{p.ref_text ?? `${p.ref_low ?? '…'}–${p.ref_high ?? '…'}${p.ref_low_female != null || p.ref_high_female != null ? ` / ${p.ref_low_female ?? '…'}–${p.ref_high_female ?? '…'}` : ''}`}</td>
              <td className="tiny">{p.critical_low != null || p.critical_high != null ? `< ${p.critical_low ?? '—'} · > ${p.critical_high ?? '—'}` : '—'}</td>
              <td>{canManage ? <span className="inline" style={{ gap: 4 }}>
                <ModalFormButton label="Edit" className="btn sm ghost" wide title={`Edit ${p.name}`} action={saveLabParameterRequest.bind(null, id, p.id)} successTitle="Saved"><ParamFields p={p} /></ModalFormButton>
                <RunButton label="Delete" className="btn sm ghost danger" action={deleteLabParameterRequest.bind(null, id, p.id)} successTitle="Deleted" confirm={{ title: 'Delete this parameter?', message: p.name, danger: true }} />
              </span> : null}</td></tr>
          ))}</tbody></TableWrap> : <EmptyState icon="🧪" title="No parameters" sub="Results cannot be entered until the test has at least one." />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ formulary */

function DrugFields({ d }: { d?: Drug }) {
  return (
    <>
      <div className="grid g3">
        <Field name="generic_name" label="Generic name" required maxLength={120} defaultValue={d?.generic_name} />
        <Field name="brand_name" label="Brand" maxLength={120} defaultValue={d?.brand_name ?? ''} />
        <Field name="strength" label="Strength" maxLength={40} defaultValue={d?.strength ?? ''} placeholder="500 mg" />
      </div>
      <div className="grid g4">
        <Field name="dosage_form" label="Form" type="select" defaultValue={d?.dosage_form ?? 'TABLET'} options={opt(S.DOSAGE_FORMS)} />
        <Field name="default_route" label="Route" type="select" defaultValue={d?.default_route ?? 'PO'} options={S.ROUTES.map((r) => ({ value: r, label: r }))} />
        <Field name="default_frequency" label="Usual frequency" type="select" defaultValue={d?.default_frequency ?? ''} options={[{ value: '', label: '—' }, ...S.FREQUENCIES.map((f) => ({ value: f.code, label: `${f.code} — ${f.label}` }))]} />
        <Field name="reorder_point" label="Reorder at" type="number" defaultValue={d?.reorder_point ?? 0} />
      </div>
      <div className="grid g4">
        <Field name="price" label="Selling price (per unit)" type="currency" defaultValue={d ? (Number(d.price ?? 0) / 100).toFixed(2) : ''} />
        {d ? null : <Field name="unit_cost" label="Unit cost" type="currency" />}
        {d ? null : <Field name="unit" label="Unit (TAB, CAP, BTL, PCS…)" maxLength={10} />}
        <Field name="controlled" label="Controlled drug" type="checkbox" defaultValue={d?.controlled ?? 0} />
        {d ? <Field name="status" label="Status" type="select" defaultValue={d.status} options={opt(['ACTIVE', 'INACTIVE'])} /> : null}
      </div>
    </>
  );
}

async function Drugs({ canManage, q }: { canManage: boolean; q: string }) {
  const drugs = await S.listDrugs({ q });
  return (
    <>
      <Toolbar><SearchInput placeholder="Generic, brand or item no.…" /><Spacer />
        {canManage ? <ModalFormButton label="Add drug" wide title="Add to the formulary" action={saveDrugRequest.bind(null, null)} successTitle="Drug added (inventory item and charge created)"><DrugFields /></ModalFormButton> : null}</Toolbar>
      <Card>
        <TableWrap><thead><tr><th>Item</th><th>Generic</th><th>Strength</th><th>Form</th><th>Route / freq.</th><th className="num">Stock</th><th className="num">Price</th><th>Status</th><th /></tr></thead>
          <tbody>{drugs.map((d) => (
            <tr key={d.id}><td className="mono">{d.item_no}</td><td><b>{d.generic_name}</b>{d.brand_name ? <div className="tiny muted-cell">{d.brand_name}</div> : null}</td><td>{d.strength ?? ''}</td><td>{humanise(d.dosage_form)}</td>
              <td className="tiny">{d.default_route} · {d.default_frequency ?? '—'}</td><td className="num">{d.stock}</td><td className="num">{formatMoney(d.price ?? 0)}</td>
              <td><Pill status={d.status} />{d.controlled ? <Pill tone="warn">CD</Pill> : null}</td>
              <td>{canManage ? <ModalFormButton label="Edit" className="btn sm ghost" wide title={`Edit ${d.generic_name}`} action={saveDrugRequest.bind(null, d.id)} successTitle="Saved"><DrugFields d={d} /></ModalFormButton> : null}</td></tr>
          ))}</tbody></TableWrap>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ ICD-10 */

async function Icd({ canManage }: { canManage: boolean }) {
  const rows = await S.listCommonIcd();
  return (
    <Card>
      <CardHead title="ICD-10 codes" sub={`${rows.length} codes — the common outpatient set; add any others you use`}>
        {canManage ? (
          <ModalFormButton label="Add code" className="btn sm" title="Add ICD-10 code" action={addIcdRequest} successTitle="Saved">
            <div className="grid g2"><Field name="code" label="Code" required maxLength={10} uppercase placeholder="J06.9" /><Field name="chapter" label="Chapter" maxLength={80} /></div>
            <Field name="title" label="Title" required maxLength={200} />
            <Field name="common" label="Show in the quick list" type="checkbox" defaultValue={1} />
          </ModalFormButton>
        ) : null}
      </CardHead>
      <TableWrap><thead><tr><th>Code</th><th>Title</th><th>Chapter</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.title}</td><td className="tiny">{r.chapter ?? ''}</td></tr>)}</tbody></TableWrap>
    </Card>
  );
}
