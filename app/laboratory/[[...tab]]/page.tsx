import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { labWorklist, labCounts, getOrderTest, listResults, rangeText, type LabView } from '@/lib/clinic/lab';
import { listLabParameters } from '@/lib/clinic/setup';
import { formatDateTime, humanise } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, DefinitionList, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/filters';
import { ModalFormButton, RunButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { BulkTable } from '@/components/clinic/pickers';
import { PatientBanner, ageSex } from '@/components/clinic/patient-banner';
import { collectSpecimensRequest, verifyResultsRequest, enterResultsRequest, rejectResultRequest } from '@/app/actions/clinic';
import type { LabOrderTestView } from '@/lib/types';

const TABS: { key: LabView; label: string }[] = [
  { key: 'collect', label: 'Specimen collection' }, { key: 'process', label: 'Result entry' }, { key: 'verify', label: 'Verification' }, { key: 'done', label: 'Released (14 days)' },
];
const overdue = (t: LabOrderTestView): boolean => Date.parse(t.ordered_at) + t.tat_minutes * 60_000 < Date.now() && t.status !== 'VERIFIED';

export default async function LabPage({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ q?: string }> }) {
  const user = await requireAction('LAB_READ');
  const { tab: seg } = await params;
  const { q = '' } = await searchParams;
  if (seg?.[0] === 'test' && seg[1]) return <ResultEntry id={Number(seg[1])} />;
  const tab = (seg?.[0] ?? 'collect') as LabView;
  if (!TABS.some((t) => t.key === tab)) notFound();
  const [rows, counts] = await Promise.all([labWorklist(tab, q), labCounts()]);
  const canWork = canAction(user, 'LAB_WORK');
  const patientCell = (t: LabOrderTestView) => <><b>{t.patient_name}</b><div className="tiny muted-cell">{t.mrn} · {ageSex(t.age, t.sex)} · {t.visit_no}</div></>;
  const testCell = (t: LabOrderTestView) => <>{t.test_name}<div className="tiny muted-cell">{humanise(t.section)} · {humanise(t.specimen_type)}</div></>;
  const prio = (t: LabOrderTestView) => (t.priority !== 'ROUTINE' ? <Pill tone="bad">{t.priority}</Pill> : <span className="tiny muted-cell">routine</span>);
  return (
    <Page title="Laboratory" crumb="Request → specimen → result → verified and released to the clinician" user={user}>
      <div className="grid g4 stack-2">
        <Stat label="To collect" value={counts.collect} />
        <Stat label="Awaiting results" value={counts.process} accent={false} />
        <Stat label="Awaiting verification" value={counts.verify} accent={false} />
        <Stat label="Past turnaround target" value={<span className={counts.overdue ? 'danger-text' : ''}>{counts.overdue}</span>} foot={`${counts.done} released today`} accent={false} />
      </div>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'collect' ? '/laboratory' : `/laboratory/${k}`)} />
      <Toolbar><SearchInput placeholder="Request, specimen, MRN, patient or test…" /><Spacer /></Toolbar>
      <Card>
        {!rows.length ? <EmptyState icon="🧪" title="Nothing here" /> : tab === 'collect' && canWork ? (
          <BulkTable label="Collect specimens" successTitle="Specimens collected — accession numbers issued" action={collectSpecimensRequest}
            head={['Request', 'Patient', 'Test', 'Priority', 'Ordered', 'Notes']}
            rows={rows.map((t) => ({ key: t.id, className: overdue(t) ? 'q-called' : '', cells: [<span key="o" className="mono">{t.order_no}</span>, patientCell(t), testCell(t), prio(t), <span key="d" className="tiny">{formatDateTime(t.ordered_at)}<div className="muted-cell">{t.ordered_by}</div></span>, <span key="n" className="tiny">{t.clinical_notes ?? ''}</span>] }))} />
        ) : tab === 'verify' && canAction(user, 'LAB_VERIFY') ? (
          <BulkTable label="Verify & release" successTitle="Results released" action={verifyResultsRequest} confirmMessage="You confirm you have reviewed these results. They will be released to the clinician and can no longer be changed."
            head={['Specimen', 'Patient', 'Test', 'Flags', 'Entered by', '']}
            rows={rows.map((t) => ({ key: t.id, cells: [<span key="s" className="mono">{t.specimen_no}</span>, patientCell(t), testCell(t),
              t.critical ? <span key="f" className="flag HH">CRITICAL</span> : t.abnormal ? <span key="f" className="flag H">{t.abnormal} abnormal</span> : <span key="f" className="tiny muted-cell">normal</span>,
              <span key="b" className="tiny">{t.resulted_by}<div className="muted-cell">{formatDateTime(t.resulted_at)}</div></span>, <Link key="l" className="btn sm ghost" href={`/laboratory/test/${t.id}`}>Review</Link>] }))} />
        ) : (
          <TableWrap>
            <thead><tr><th>{tab === 'collect' ? 'Request' : 'Specimen'}</th><th>Patient</th><th>Test</th><th>Priority</th><th>{tab === 'done' ? 'Released' : 'Collected'}</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id} className={overdue(t) ? 'q-called' : ''}>
                <td className="mono">{t.specimen_no ?? t.order_no}</td><td>{patientCell(t)}</td><td>{testCell(t)}</td><td>{prio(t)}</td>
                <td className="tiny">{formatDateTime(tab === 'done' ? t.verified_at : t.collected_at)}</td>
                <td><Pill status={t.status} />{t.critical ? <span className="flag HH" style={{ marginLeft: 4 }}>CRIT</span> : null}</td>
                <td>{tab === 'done' ? <Link className="btn sm ghost" target="_blank" href={`/clinic-print/lab/${t.order_no}`}>Report</Link>
                  : <Link className="btn sm" href={`/laboratory/test/${t.id}`}>{tab === 'process' ? 'Enter results' : 'Open'}</Link>}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}

async function ResultEntry({ id }: { id: number }) {
  const user = await requireAction('LAB_READ');
  const t = await getOrderTest(id);
  if (!t) notFound();
  const [params, results] = await Promise.all([listLabParameters(t.lab_test_id), listResults(id)]);
  const byParam = new Map(results.map((r) => [r.parameter_id, r]));
  const canEnter = canAction(user, 'LAB_WORK') && (t.status === 'COLLECTED' || t.status === 'RESULTED');
  const canVerify = canAction(user, 'LAB_VERIFY') && t.status === 'RESULTED' && t.resulted_by !== user.username;
  return (
    <Page title={`${t.test_name} — ${t.specimen_no ?? t.order_no}`} crumb={`${t.order_no} · ${humanise(t.section)} · ${humanise(t.specimen_type)} · target ${t.tat_minutes} min`} user={user}>
      <PatientBanner p={{ mrn: t.mrn, patient_name: t.patient_name, sex: t.sex, age: t.age }} right={<Pill status={t.status} />} />
      <Toolbar>
        <Link className="btn ghost sm" href={t.status === 'RESULTED' ? '/laboratory/verify' : '/laboratory/process'}>← Worklist</Link>
        <Spacer />
        {canEnter ? (
          <ModalFormButton label={t.status === 'RESULTED' ? 'Correct results' : 'Enter results'} wide title={`Results — ${t.test_name}`} action={enterResultsRequest.bind(null, t.id)} submitLabel="Save results" successTitle="Results saved">
            <div className="grid g2">
              {params.map((p) => {
                const r = byParam.get(p.id);
                const range = rangeText(p, t.sex);
                const label = `${p.name}${p.unit ? ` (${p.unit})` : ''}${range ? ` · ref ${range}` : ''}`;
                return p.result_type === 'OPTION'
                  ? <Field key={p.id} name={`p_${p.id}`} label={label} type="select" defaultValue={r?.value_text ?? ''} options={[{ value: '', label: '—' }, ...(p.options ?? '').split(',').map((o) => ({ value: o.trim(), label: o.trim() }))]} />
                  : <Field key={p.id} name={`p_${p.id}`} label={label} type={p.result_type === 'NUMERIC' ? 'number' : 'text'} step="any" defaultValue={r ? (r.value_num ?? r.value_text ?? '') : ''} />;
              })}
            </div>
            <Field name="comment" label="Comment" type="textarea" rows={2} maxLength={1000} defaultValue={t.comment ?? ''} />
          </ModalFormButton>
        ) : null}
        {canVerify ? (
          <>
            <ModalFormButton label="Return for re-entry" className="btn ghost danger" title="Return the result" action={rejectResultRequest.bind(null, t.id)} submitLabel="Return" successTitle="Returned">
              <Field name="reason" label="What is wrong" required maxLength={300} />
            </ModalFormButton>
            <RunButton label="Verify & release" action={verifyResultsRequest.bind(null, [t.id])} successTitle="Result released" confirm={{ title: 'Release this result?', message: 'It goes to the clinician and can no longer be changed.' }} />
          </>
        ) : null}
        {t.status === 'RESULTED' && t.resulted_by === user.username ? <span className="tiny muted-cell">You entered this result — another person must verify it.</span> : null}
      </Toolbar>
      <Card>
        <CardHead title="Results" sub={t.resulted_at ? `Entered ${formatDateTime(t.resulted_at)} by ${t.resulted_by}` : 'Not entered yet'} />
        <TableWrap>
          <thead><tr><th>Parameter</th><th className="num">Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
          <tbody>{params.map((p) => { const r = byParam.get(p.id); return (
            <tr key={p.id}><td>{p.name}</td><td className="num"><b>{r ? (r.value_num ?? r.value_text) : '—'}</b></td><td className="tiny">{p.unit ?? ''}</td><td className="tiny">{rangeText(p, t.sex)}</td>
              <td>{r ? <span className={`flag ${r.flag}`}>{r.flag === 'N' ? '' : r.flag}</span> : null}</td></tr>
          ); })}</tbody>
        </TableWrap>
        {!params.length ? <EmptyState icon="⚙" title="No parameters set up for this test" sub="Add them under Clinic Setup › Lab catalogue." /> : null}
      </Card>
      <Card>
        <DefinitionList items={[
          ['Requested', `${formatDateTime(t.ordered_at)} by ${t.ordered_by}`], ['Clinical notes', t.clinical_notes ?? '—'],
          ['Collected', t.collected_at ? `${formatDateTime(t.collected_at)} by ${t.collected_by}` : '—'],
          ['Verified', t.verified_at ? `${formatDateTime(t.verified_at)} by ${t.verified_by ?? '—'}` : '—'], ['Comment', t.comment ?? '—'],
        ]} />
      </Card>
    </Page>
  );
}
