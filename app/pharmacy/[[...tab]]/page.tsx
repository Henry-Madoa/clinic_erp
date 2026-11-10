import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { prescriptionQueue, getPrescription, prescriptionLines, lowStock, dispensingSummary } from '@/lib/clinic/pharmacy';
import { listDrugs } from '@/lib/clinic/setup';
import { addDays } from '@/lib/dateFormula';
import { formatDateTime, formatMoney, humanise, today } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/filters';
import { ModalFormButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { PatientBanner } from '@/components/clinic/patient-banner';
import { dispenseRequest, cancelRxLineRequest } from '@/app/actions/clinic';

const TABS = [{ key: 'pending', label: 'To dispense' }, { key: 'dispensed', label: 'Dispensed (14 days)' }, { key: 'stock', label: 'Drug stock' }, { key: 'reorder', label: 'Low stock' }];

export default async function PharmacyPage({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ q?: string }> }) {
  const user = await requireAction('PHARMACY_READ');
  const seg = (await params).tab;
  const { q = '' } = await searchParams;
  if (seg?.[0] === 'rx' && seg[1]) return <Dispense no={decodeURIComponent(seg[1])} />;
  const tab = seg?.[0] ?? 'pending';
  if (!TABS.some((t) => t.key === tab)) notFound();
  return (
    <Page title="Pharmacy" crumb="Dispense against prescriptions — stock issues at FIFO cost and the drugs are charged to the visit" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'pending' ? '/pharmacy' : `/pharmacy/${k}`)} />
      {tab === 'pending' || tab === 'dispensed' ? <RxList view={tab} q={q} /> : tab === 'stock' ? <Stock q={q} /> : <Reorder />}
    </Page>
  );
}

async function RxList({ view, q }: { view: 'pending' | 'dispensed'; q: string }) {
  const rows = await prescriptionQueue(view, q);
  return (
    <>
      <Toolbar><SearchInput placeholder="Rx, MRN or name…" /></Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>Rx</th><th>Patient</th><th>Payer</th><th>Prescribed</th><th className="num">Lines</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="mono">{r.no}</td>
                <td><b>{r.patient_name}</b><div className="tiny muted-cell">{r.mrn} · {r.visit_no}</div>{r.allergies && !/^(none|nkda|nil)/i.test(r.allergies) ? <div className="tiny danger-text">⚠ {r.allergies}</div> : null}</td>
                <td className="tiny">{r.scheme_name ?? 'Cash'}</td><td className="tiny">{formatDateTime(r.prescribed_at)}<div className="muted-cell">{r.prescribed_by}</div></td>
                <td className="num">{r.lines}</td><td><Pill status={r.status} /></td>
                <td><Link className="btn sm" href={`/pharmacy/rx/${r.no}`}>{view === 'pending' ? 'Dispense' : 'Open'}</Link></td></tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="💊" title={view === 'pending' ? 'No prescriptions waiting' : 'Nothing dispensed recently'} />}
      </Card>
    </>
  );
}

async function Dispense({ no }: { no: string }) {
  const user = await requireAction('PHARMACY_READ');
  const rx = await getPrescription(no);
  if (!rx) notFound();
  const lines = await prescriptionLines(rx.id);
  const pending = lines.filter((l) => l.status === 'PENDING');
  const canDispense = canAction(user, 'PHARMACY_DISPENSE') && pending.length > 0;
  return (
    <Page title={`Prescription ${rx.no}`} crumb={`Visit ${rx.visit_no} · prescribed ${formatDateTime(rx.prescribed_at)} by ${rx.prescribed_by}`} user={user}>
      <PatientBanner p={{ mrn: rx.mrn!, patient_name: rx.patient_name, sex: rx.sex ?? 'FEMALE', age: rx.age ?? null, allergies: rx.allergies, payer: rx.scheme_name ?? 'Cash' }} right={<Pill status={rx.status} />} />
      <Toolbar>
        <Link className="btn ghost sm" href="/pharmacy">← Prescriptions</Link>
        <Link className="btn ghost sm" target="_blank" href={`/clinic-print/rx/${rx.no}`}>Print labels / prescription</Link>
        <Spacer />
        {canDispense ? (
          <ModalFormButton label="Dispense" wide title={`Dispense ${rx.no}`} action={dispenseRequest.bind(null, rx.no)} submitLabel="Dispense & charge" successTitle="Dispensed">
            <p className="tiny muted-cell">Enter the quantity handed over for each line (up to what was prescribed). Tick “out of stock” for anything the patient must buy elsewhere.</p>
            {pending.map((l) => (
              <div key={l.id} className="grid g3" style={{ alignItems: 'end' }}>
                <div className="field"><label>{l.generic_name} {l.strength ?? ''}</label><div className="tiny">{l.dose} {l.route} {l.frequency} × {l.duration_days} d · prescribed {l.quantity} · <b>{l.stock}</b> in store</div></div>
                <Field name={`qty_${l.id}`} label="Quantity to dispense" type="number" min={1} max={l.quantity} defaultValue={Number(l.stock ?? 0) >= l.quantity ? l.quantity : ''} />
                <Field name={`oos_${l.id}`} label="Out of stock" type="checkbox" defaultValue={Number(l.stock ?? 0) <= 0 ? 1 : 0} />
              </div>
            ))}
          </ModalFormButton>
        ) : null}
      </Toolbar>
      <Card>
        <CardHead title="Lines" sub={rx.notes ?? undefined} />
        <TableWrap>
          <thead><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th className="num">Days</th><th className="num">Prescribed</th><th className="num">In store</th><th className="num">Price</th><th>Status</th><th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id}><td><b>{l.generic_name}</b> {l.strength ?? ''} <span className="tiny muted-cell">{humanise(l.dosage_form ?? '').toLowerCase()}{l.brand_name ? ` · ${l.brand_name}` : ''}</span><div className="tiny muted-cell">{l.instructions ?? ''}</div></td>
              <td>{l.dose} {l.route}</td><td>{l.frequency}</td><td className="num">{l.duration_days}</td><td className="num">{l.quantity}{l.dispensed_qty ? ` (${l.dispensed_qty} given)` : ''}</td>
              <td className={`num ${Number(l.stock) < l.quantity ? 'danger-text' : ''}`}>{l.stock}</td><td className="num">{formatMoney(l.price ?? 0)}</td><td><Pill status={l.status} /></td>
              <td>{canAction(user, 'PHARMACY_DISPENSE') && (l.status === 'PENDING' || l.status === 'OUT_OF_STOCK') ? (
                <ModalFormButton label="Cancel" className="btn sm ghost danger" title="Cancel line" action={cancelRxLineRequest.bind(null, l.id)} successTitle="Line cancelled">
                  <Field name="reason" label="Reason" required maxLength={300} />
                </ModalFormButton>
              ) : null}</td></tr>
          ))}</tbody>
        </TableWrap>
      </Card>
    </Page>
  );
}

async function Stock({ q }: { q: string }) {
  const [drugs, summary] = await Promise.all([listDrugs({ q }), dispensingSummary(addDays(today(), -29), today())]);
  const value = drugs.reduce((a, d) => a + Number(d.stock ?? 0) * Number(d.unit_cost ?? 0), 0);
  return (
    <>
      <div className="grid g3 stack-2">
        <Stat label="Formulary items" value={drugs.length} />
        <Stat accent={false} label="Stock value (at unit cost)" value={formatMoney(value)} />
        <Stat accent={false} label="Dispensed revenue (30 days)" value={formatMoney(summary.reduce((a, s) => a + Number(s.revenue), 0))} />
      </div>
      <Toolbar><SearchInput placeholder="Generic, brand or item no.…" /><Spacer /><Link className="btn ghost sm" href="/clinic-setup/drugs">Manage formulary</Link><Link className="btn ghost sm" href="/inventory/item-journal">Receive / adjust stock</Link></Toolbar>
      <Card>
        <TableWrap>
          <thead><tr><th>Item</th><th>Drug</th><th>Form</th><th className="num">In stock</th><th className="num">Reorder at</th><th className="num">Unit cost</th><th className="num">Price</th><th /></tr></thead>
          <tbody>{drugs.map((d) => (
            <tr key={d.id}><td className="mono">{d.item_no}</td><td><b>{d.generic_name}</b> {d.strength ?? ''}{d.brand_name ? <div className="tiny muted-cell">{d.brand_name}</div> : null}</td>
              <td>{humanise(d.dosage_form)}</td><td className={`num ${Number(d.stock) <= Number(d.reorder_point) ? 'danger-text' : ''}`}>{d.stock}</td><td className="num">{d.reorder_point}</td>
              <td className="num">{formatMoney(d.unit_cost ?? 0)}</td><td className="num">{formatMoney(d.price ?? 0)}</td>
              <td>{d.controlled ? <Pill tone="warn">Controlled</Pill> : null}</td></tr>
          ))}</tbody>
        </TableWrap>
      </Card>
      <Card>
        <CardHead title="Top dispensed — last 30 days" />
        {summary.length ? <TableWrap><thead><tr><th>Drug</th><th className="num">Units</th><th className="num">Patients</th><th className="num">Revenue</th></tr></thead>
          <tbody>{summary.map((s, i) => <tr key={i}><td>{s.generic_name} {s.strength ?? ''}</td><td className="num">{s.qty}</td><td className="num">{s.patients}</td><td className="num">{formatMoney(s.revenue)}</td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="💊" title="Nothing dispensed" />}
      </Card>
    </>
  );
}

async function Reorder() {
  const rows = await lowStock();
  return (
    <Card>
      <CardHead title="At or below reorder point" sub="Raise a purchase requisition or order from the supplier">
        <Link className="btn sm" href="/requisitions/purchase">Purchase requisition</Link>
      </CardHead>
      {rows.length ? <TableWrap><thead><tr><th>Item</th><th>Drug</th><th className="num">In store</th><th className="num">Reorder point</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="mono">{r.item_no}</td><td>{r.generic_name} {r.strength ?? ''}</td><td className="num danger-text">{r.stock}</td><td className="num">{r.reorder_point}</td></tr>)}</tbody></TableWrap>
        : <EmptyState icon="✅" title="Stock is healthy" />}
    </Card>
  );
}
