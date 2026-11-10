import Link from 'next/link';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { listProcedureWorklist } from '@/lib/clinic/consultation';
import { formatDateTime } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, CardHead, EmptyState, Pill, TableWrap } from '@/components/ui/primitives';
import { ModalFormButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { completeProcedureRequest } from '@/app/actions/clinic';

export default async function ProceduresPage() {
  const user = await requireAction('PROCEDURES_READ');
  const [todo, done] = await Promise.all([listProcedureWorklist('ORDERED'), listProcedureWorklist('DONE')]);
  const canWork = canAction(user, 'PROCEDURES_WORK');
  return (
    <Page title="Procedures & Nursing" crumb="Injections, dressings, suturing, nebulisation, ECGs and minor procedures ordered by the clinicians" user={user}>
      <Card>
        <CardHead title="To do" sub={`${todo.length} waiting`} />
        {todo.length ? (
          <TableWrap><thead><tr><th>Patient</th><th>Procedure</th><th className="num">Qty</th><th>Ordered</th><th>Notes</th><th /></tr></thead>
            <tbody>{todo.map((p) => (
              <tr key={p.id}><td><Link href={`/visits/${p.visit_no}`}><b>{p.patient_name}</b></Link><div className="tiny muted-cell">{p.mrn} · {p.visit_no}</div></td>
                <td>{p.description}</td><td className="num">{p.quantity}</td><td className="tiny">{formatDateTime(p.ordered_at)}<div className="muted-cell">{p.ordered_by}</div></td><td className="tiny">{p.notes ?? ''}</td>
                <td>{canWork ? (
                  <ModalFormButton label="Done" className="btn sm" title={`${p.description} — done`} action={completeProcedureRequest.bind(null, p.id)} successTitle="Recorded">
                    <Field name="notes" label="Procedure notes" type="textarea" rows={3} maxLength={1000} />
                  </ModalFormButton>
                ) : null}</td></tr>
            ))}</tbody></TableWrap>
        ) : <EmptyState icon="💉" title="Nothing waiting" />}
      </Card>
      <Card>
        <CardHead title="Done — last 7 days" />
        {done.length ? <TableWrap><thead><tr><th>Patient</th><th>Procedure</th><th>Done</th><th>By</th><th>Notes</th><th>Status</th></tr></thead>
          <tbody>{done.map((p) => <tr key={p.id}><td>{p.patient_name}<div className="tiny muted-cell">{p.mrn}</div></td><td>{p.description}</td><td className="tiny">{formatDateTime(p.performed_at)}</td><td className="tiny">{p.performed_by}</td><td className="tiny">{p.notes ?? ''}</td><td><Pill status={p.status} /></td></tr>)}</tbody></TableWrap>
          : <EmptyState icon="💉" title="None" />}
      </Card>
    </Page>
  );
}
