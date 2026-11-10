import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { imagingWorklist } from '@/lib/clinic/imaging';
import { formatDateTime } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Pill, TableWrap, Tabs, Toolbar } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/filters';
import { ModalFormButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { ageSex } from '@/components/clinic/patient-banner';
import { imagingPerformedRequest, imagingReportRequest } from '@/app/actions/clinic';

const TABS = [{ key: 'pending', label: 'To perform' }, { key: 'reporting', label: 'To report' }, { key: 'done', label: 'Reported (30 days)' }];

export default async function ImagingPage({ params, searchParams }: { params: Promise<{ tab?: string[] }>; searchParams: Promise<{ q?: string }> }) {
  const user = await requireAction('IMAGING_READ');
  const tab = (await params).tab?.[0] ?? 'pending';
  const { q = '' } = await searchParams;
  if (!TABS.some((t) => t.key === tab)) notFound();
  const rows = await imagingWorklist(tab as 'pending', q);
  const canWork = canAction(user, 'IMAGING_WORK');
  return (
    <Page title="Imaging & Radiology" crumb="X-ray, ultrasound, dental OPG / CBCT and ECG — performed, reported and returned to the clinician" user={user}>
      <Tabs tabs={TABS} active={tab} hrefFor={(k) => (k === 'pending' ? '/imaging' : `/imaging/${k}`)} />
      <Toolbar><SearchInput placeholder="Request, MRN or name…" /></Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>No.</th><th>Patient</th><th>Study</th><th>Priority</th><th>Requested</th><th>Clinical question</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.no}</td>
                <td><Link href={`/visits/${o.visit_no}/results`}><b>{o.patient_name}</b></Link><div className="tiny muted-cell">{o.mrn} · {ageSex(o.age, o.sex ?? 'MALE')}</div></td>
                <td>{o.service_name}<div className="tiny muted-cell">{o.modality}{o.body_part ? ` · ${o.body_part}` : ''}</div></td>
                <td>{o.priority !== 'ROUTINE' ? <Pill tone="bad">{o.priority}</Pill> : 'Routine'}</td>
                <td className="tiny">{formatDateTime(o.ordered_at)}<div className="muted-cell">{o.ordered_by}</div></td>
                <td className="tiny">{tab === 'done' ? <b>{o.impression}</b> : o.clinical_notes ?? '—'}</td>
                <td><Pill status={o.status} /></td>
                <td className="inline" style={{ gap: 4 }}>
                  {canWork && o.status === 'ORDERED' ? (
                    <ModalFormButton label="Performed" className="btn sm ghost" title={`${o.no} performed`} action={imagingPerformedRequest.bind(null, o.no)} successTitle="Marked performed">
                      <Field name="image_url" label="Image link (uploaded study, optional)" maxLength={500} placeholder="https://res.cloudinary.com/…" />
                    </ModalFormButton>
                  ) : null}
                  {canWork && (o.status === 'ORDERED' || o.status === 'PERFORMED') ? (
                    <ModalFormButton label="Report" className="btn sm" wide title={`Report ${o.no} — ${o.service_name}`} action={imagingReportRequest.bind(null, o.no)} submitLabel="Sign report" successTitle="Report signed">
                      <Field name="findings" label="Findings" type="textarea" rows={7} required maxLength={8000} />
                      <Field name="impression" label="Impression / conclusion" type="textarea" rows={3} required maxLength={2000} />
                      <Field name="image_url" label="Image link (optional)" maxLength={500} />
                    </ModalFormButton>
                  ) : null}
                  {o.image_url ? <a className="btn sm ghost" href={o.image_url} target="_blank" rel="noreferrer">Images</a> : null}
                </td>
              </tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="🩻" title="Nothing here" />}
      </Card>
    </Page>
  );
}
