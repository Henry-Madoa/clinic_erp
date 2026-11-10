import Link from 'next/link';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { listPatients, patientCounts, PATIENT_FILTER_FIELDS } from '@/lib/clinic/patients';
import { parseFilters } from '@/lib/listFilters';
import { formatDate } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Pill, Stat, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/filters';
import { ListTools } from '@/components/ui/list-tools';
import { ModalFormButton } from '@/components/ui/modal-form';
import { PatientFields } from '@/components/clinic/fields';
import { ageSex } from '@/components/clinic/patient-banner';
import { registerPatientRequest } from '@/app/actions/clinic';

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; filters?: string }> }) {
  const user = await requireAction('PATIENTS_READ');
  const { q = '', filters } = await searchParams;
  const [rows, counts] = await Promise.all([listPatients(q, parseFilters(filters)), patientCounts()]);
  return (
    <Page title="Patients" crumb="Find a patient to open their chart and check them in — or register someone new" user={user}>
      <div className="grid g3 stack-2">
        <Stat label="Patients on the register" value={counts.total.toLocaleString('en-KE')} />
        <Stat label="Registered today" value={counts.newToday} accent={false} />
        <Stat label="Registered this month" value={counts.newMonth} accent={false} />
      </div>
      <Toolbar>
        <SearchInput placeholder="Name, MRN, phone or last 4 of ID…" />
        <ListTools exportKey="patients" fields={PATIENT_FILTER_FIELDS} filters={filters} params={{ q }} count={rows.length} />
        <Spacer />
        {canAction(user, 'PATIENTS_MANAGE') ? (
          <ModalFormButton label="Register patient" title="Register a new patient" wide action={registerPatientRequest} submitLabel="Register"
            successTitle="Patient registered" redirectPrefix="/patients/" redirectField="mrn">
            <PatientFields withCover />
          </ModalFormButton>
        ) : null}
      </Toolbar>
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead><tr><th>MRN</th><th>Name</th><th>Age / sex</th><th>Phone</th><th>Cover</th><th className="num">Visits</th><th>Last visit</th><th>Now</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className="mono"><Link href={`/patients/${p.mrn}`}>{p.mrn}</Link></td>
                <td><Link href={`/patients/${p.mrn}`}><b>{p.full_name}</b></Link>
                  {p.alerts || (p.allergies && !/^(none|nkda|nil)/i.test(p.allergies)) ? <div className="tiny danger-text">⚠ {[p.allergies, p.alerts].filter(Boolean).join(' · ')}</div> : null}</td>
                <td>{ageSex(p.age, p.sex)}</td>
                <td className="tiny">{p.phone ?? '—'}</td>
                <td className="tiny">{p.default_scheme ?? <span className="muted-cell">Cash</span>}</td>
                <td className="num">{p.visits}</td>
                <td className="tiny">{formatDate(p.last_visit_date)}</td>
                <td>{p.open_visit_no ? <Link href={`/visits/${p.open_visit_no}`}><Pill tone="info">In clinic</Pill></Link>
                  : p.status !== 'ACTIVE' ? <Pill status={p.status} /> : <Link className="btn sm ghost" href={`/patients/${p.mrn}?checkin=1`}>Check in</Link>}</td>
              </tr>
            ))}</tbody>
          </TableWrap>
        ) : <EmptyState icon="🪪" title={q ? 'No patient matches' : 'No patients yet'} sub={q ? 'Check the spelling, or register them.' : 'Register the first patient.'} />}
      </Card>
    </Page>
  );
}
