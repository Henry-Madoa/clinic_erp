import Link from 'next/link';
import { requireAction } from '@/lib/session';
import { canAction } from '@/lib/permissions';
import { listAppointments, appointmentStats } from '@/lib/clinic/appointments';
import { getClinicSetup, listDepartments } from '@/lib/clinic/setup';
import { addDays } from '@/lib/dateFormula';
import { formatDate, humanise, today } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { Card, EmptyState, Pill, Stat, TableWrap, Tabs, Toolbar, Spacer } from '@/components/ui/primitives';
import { SearchInput, DateFilterInput, SelectFilter } from '@/components/ui/filters';
import { ModalFormButton, RunButton } from '@/components/ui/modal-form';
import { Field } from '@/components/ui/field';
import { BookingFields } from '@/components/clinic/fields';
import { bookAppointmentRequest, appointmentStatusRequest, rescheduleAppointmentRequest } from '@/app/actions/clinic';
import type { Appointment, SessionUser } from '@/lib/types';

const VIEWS = [{ key: 'day', label: 'Day sheet' }, { key: 'week', label: 'Next 7 days' }, { key: 'list', label: 'Search all' }];
const toMins = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; dept?: string; q?: string; status?: string }> }) {
  const user = await requireAction('APPOINTMENTS_READ');
  const sp = await searchParams;
  const view = sp.view ?? 'day';
  const date = sp.date || today();
  const [depts, stats, setup] = await Promise.all([listDepartments(true, 'CLINIC'), appointmentStats(date), getClinicSetup()]);
  const range = view === 'day' ? { from: date, to: date } : view === 'week' ? { from: date, to: addDays(date, 6) } : { from: addDays(today(), -365), to: addDays(today(), 365) };
  const rows = await listAppointments({ ...range, department: sp.dept, q: sp.q, status: sp.status });
  const qs = (k: string) => `/appointments?view=${k}${sp.date ? `&date=${sp.date}` : ''}${sp.dept ? `&dept=${sp.dept}` : ''}`;
  return (
    <Page title="Appointments" crumb="Bookings by clinic and clinician — reminders go out by SMS the day before" user={user}>
      <Tabs tabs={VIEWS} active={view} hrefFor={qs} />
      <div className="grid g4 stack-2">
        <Stat label={`Still booked ${date === today() ? 'today' : formatDate(date)}`} value={stats.booked} />
        <Stat accent={false} label="Arrived" value={stats.arrived} />
        <Stat accent={false} label="No-shows / cancelled" value={`${stats.noShow} / ${stats.cancelled}`} />
        <Stat accent={false} label="Booked next 7 days" value={stats.upcoming7} />
      </div>
      <Toolbar>
        {view !== 'list' ? <DateFilterInput paramName="date" label="Date" /> : null}
        <SelectFilter paramName="dept" label="Clinic" allLabel="All clinics" options={depts.map((d) => ({ value: d.code, label: d.name }))} />
        {view === 'list' ? <><SelectFilter paramName="status" label="Status" options={['BOOKED', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => ({ value: s, label: humanise(s) }))} /><SearchInput placeholder="No., MRN, name or phone…" /></> : null}
        {view !== 'list' ? <><Link className="btn ghost sm" href={`/appointments?view=${view}&date=${addDays(date, view === 'week' ? -7 : -1)}${sp.dept ? `&dept=${sp.dept}` : ''}`}>‹</Link>
          <Link className="btn ghost sm" href={`/appointments?view=${view}${sp.dept ? `&dept=${sp.dept}` : ''}`}>Today</Link>
          <Link className="btn ghost sm" href={`/appointments?view=${view}&date=${addDays(date, view === 'week' ? 7 : 1)}${sp.dept ? `&dept=${sp.dept}` : ''}`}>›</Link></> : null}
        <Spacer />
        {canAction(user, 'APPOINTMENTS_MANAGE') ? (
          <ModalFormButton label="Book appointment" wide title="Book an appointment" action={bookAppointmentRequest} submitLabel="Book" successTitle="Appointment booked">
            <BookingFields date={date >= today() ? date : today()} />
          </ModalFormButton>
        ) : null}
      </Toolbar>
      {view === 'day' ? <DayGrid rows={rows} depts={depts.filter((d) => !sp.dept || d.code === sp.dept)} start={setup.day_start} end={setup.day_end} slot={setup.slot_minutes} />
        : <Card>{rows.length ? <ApptTable rows={rows} user={user} /> : <EmptyState icon="📅" title="No appointments" />}</Card>}
      {view === 'day' && rows.length ? <Card><ApptTable rows={rows} user={user} /></Card> : null}
    </Page>
  );
}

function DayGrid({ rows, depts, start, end, slot }: { rows: Appointment[]; depts: { code: string; name: string; colour: string }[]; start: string; end: string; slot: number }) {
  if (!depts.length) return <Card><EmptyState icon="📅" title="No clinics set up" /></Card>;
  const times: string[] = [];
  for (let m = toMins(start); m < toMins(end); m += slot) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  const at = (code: string, t: string) => rows.filter((a) => a.department_code === code && toMins(a.start_time) >= toMins(t) && toMins(a.start_time) < toMins(t) + slot);
  return (
    <div className="day-grid stack-2" style={{ ['--cols' as string]: depts.length }}>
      <div className="dg-head" />
      {depts.map((d) => <div key={d.code} className="dg-head" style={{ borderTop: `4px solid ${d.colour}` }}>{d.name}</div>)}
      {times.map((t) => [
        <div key={`t${t}`} className="dg-time">{t}</div>,
        ...depts.map((d) => (
          <div key={`${d.code}${t}`} className="dg-cell">
            {at(d.code, t).map((a) => (
              <Link key={a.no} href={a.visit_no ? `/visits/${a.visit_no}` : `/patients/${a.mrn}?appt=${a.no}&dept=${a.department_code}`} className={`appt-card ${a.status}`} style={{ ['--ac' as string]: d.colour }}>
                <b>{a.start_time}</b> {a.patient_name}<div className="tiny">{humanise(a.appointment_type)}{a.clinician_name ? ` · ${a.clinician_name}` : ''}</div>
              </Link>
            ))}
          </div>
        )),
      ])}
    </div>
  );
}

function ApptTable({ rows, user }: { rows: Appointment[]; user: SessionUser }) {
  const canManage = canAction(user, 'APPOINTMENTS_MANAGE');
  return (
    <TableWrap>
      <thead><tr><th>No.</th><th>Date</th><th>Time</th><th>Patient</th><th>Clinic</th><th>With</th><th>Type</th><th>Reminder</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map((a) => {
        const open = a.status === 'BOOKED' || a.status === 'CONFIRMED';
        return (
          <tr key={a.no}>
            <td className="mono">{a.no}</td><td>{formatDate(a.appointment_date)}</td><td>{a.start_time}</td>
            <td><Link href={`/patients/${a.mrn}`}><b>{a.patient_name}</b></Link><div className="tiny muted-cell">{a.mrn} · {a.phone ?? 'no phone'}</div></td>
            <td>{a.department_name}</td><td className="tiny">{a.clinician_name ?? '—'}</td><td className="tiny">{humanise(a.appointment_type)}{a.reason ? <div className="muted-cell">{a.reason}</div> : null}</td>
            <td className="tiny">{a.reminder_sent_at ? '✓ sent' : '—'}</td><td><Pill status={a.status} /></td>
            <td>{open && canManage ? (
              <span className="inline" style={{ gap: 4 }}>
                {a.appointment_date === today() ? <Link className="btn sm" href={`/patients/${a.mrn}?appt=${a.no}&dept=${a.department_code}`}>Check in</Link> : null}
                {a.status === 'BOOKED' ? <RunButton label="Confirm" className="btn sm ghost" action={appointmentStatusRequest.bind(null, a.no, 'CONFIRMED', {})} successTitle="Confirmed" /> : null}
                <ModalFormButton label="Move" className="btn sm ghost" title={`Reschedule ${a.no}`} action={rescheduleAppointmentRequest.bind(null, a.no)} submitLabel="Move" successTitle="Rescheduled">
                  <div className="grid g3">
                    <Field name="appointment_date" label="Date" type="date" required min={today()} defaultValue={a.appointment_date} />
                    <Field name="start_time" label="Time" type="time" required defaultValue={a.start_time} />
                    <Field name="duration_mins" label="Minutes" type="number" defaultValue={a.duration_mins} />
                  </div>
                  <input type="hidden" name="clinician_user_id" value={a.clinician_user_id ?? ''} />
                </ModalFormButton>
                <ModalFormButton label="Cancel" className="btn sm ghost danger" title={`Cancel ${a.no}`} action={appointmentStatusRequest.bind(null, a.no, 'CANCELLED')} submitLabel="Cancel appointment" successTitle="Cancelled">
                  <Field name="reason" label="Reason" required maxLength={300} />
                </ModalFormButton>
              </span>
            ) : a.visit_no ? <Link className="btn sm ghost" href={`/visits/${a.visit_no}`}>Visit</Link> : null}</td>
          </tr>
        );
      })}</tbody>
    </TableWrap>
  );
}
