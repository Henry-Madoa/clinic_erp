'use server';

/*
 * The clinic's Server Actions. Every one authorises first (requireAction — page Execute plus the
 * table rights the operation touches); the services in lib/clinic re-validate every value.
 */
import { revalidatePath } from 'next/cache';
import { requireAction, requireUser } from '@/lib/session';
import { actionResult } from '@/lib/errors';
import * as setup from '@/lib/clinic/setup';
import * as patients from '@/lib/clinic/patients';
import * as visits from '@/lib/clinic/visits';
import * as consult from '@/lib/clinic/consultation';
import * as billing from '@/lib/clinic/billing';
import * as lab from '@/lib/clinic/lab';
import * as imaging from '@/lib/clinic/imaging';
import * as pharmacy from '@/lib/clinic/pharmacy';
import * as dental from '@/lib/clinic/dental';
import * as claims from '@/lib/clinic/claims';
import * as appts from '@/lib/clinic/appointments';
import type { ActionResult, FormValues } from '@/lib/types';
import type { PrescriptionDraftLine } from '@/lib/clinic/consultation';

const ok = { saved: true as const };
function refreshVisit(no?: string): void {
  revalidatePath('/visits', 'layout');
  revalidatePath('/queue', 'layout');
  revalidatePath('/dashboard');
  if (no) revalidatePath(`/visits/${no}`, 'layout');
}
const refreshPatient = (mrn?: string): void => { revalidatePath('/patients', 'layout'); if (mrn) revalidatePath(`/patients/${mrn}`); };

/* ------------------------------------------------------------------ patients */

export async function registerPatientRequest(v: FormValues): Promise<ActionResult<{ mrn: string }>> {
  return actionResult(async () => {
    const r = await patients.registerPatient(v, await requireAction('PATIENTS_MANAGE'));
    refreshPatient();
    return { mrn: r.mrn };
  });
}
export async function updatePatientRequest(mrn: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await patients.updatePatient(mrn, v, await requireAction('PATIENTS_MANAGE')); refreshPatient(mrn); return ok; });
}
export async function setPatientPhotoRequest(mrn: string, url: string | null): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await patients.setPatientPhoto(mrn, url, await requireAction('PATIENTS_MANAGE')); refreshPatient(mrn); return ok; });
}
export async function revealPatientIdRequest(mrn: string): Promise<ActionResult<{ value: string | null }>> {
  return actionResult(async () => ({ value: await patients.revealIdNumber(mrn, await requireAction('PATIENTS_PII_VIEW')) }));
}
export async function addCoverRequest(patientId: number, mrn: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await patients.addCover(patientId, v, await requireAction('PATIENTS_MANAGE')); refreshPatient(mrn); return ok; });
}
export async function endCoverRequest(coverId: number, mrn: string): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await patients.endCover(coverId, await requireAction('PATIENTS_MANAGE')); refreshPatient(mrn); return ok; });
}
export async function defaultCoverRequest(coverId: number, mrn: string): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await patients.makeDefaultCover(coverId, await requireAction('PATIENTS_MANAGE')); refreshPatient(mrn); return ok; });
}
export async function searchPatientsRequest(q: string): Promise<ActionResult<{ id: number; mrn: string; name: string; phone: string | null; age: number | null; sex: string; open: string | null }[]>> {
  return actionResult(async () => {
    await requireAction('PATIENTS_READ');
    const rows = await patients.listPatients(String(q ?? ''), [], 12);
    return rows.map((p) => ({ id: p.id, mrn: p.mrn, name: p.full_name, phone: p.phone, age: p.age, sex: p.sex, open: p.open_visit_no }));
  });
}

/* ------------------------------------------------------------------ appointments */

export async function bookAppointmentRequest(v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await appts.bookAppointment(v, await requireAction('APPOINTMENTS_MANAGE')); revalidatePath('/appointments', 'layout'); return r; });
}
export async function rescheduleAppointmentRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await appts.rescheduleAppointment(no, v, await requireAction('APPOINTMENTS_MANAGE')); revalidatePath('/appointments', 'layout'); return ok; });
}
export async function appointmentStatusRequest(no: string, status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW', v: FormValues = {}): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => {
    if (!['CONFIRMED', 'CANCELLED', 'NO_SHOW'].includes(status)) throw new Error('Invalid status');
    await appts.setAppointmentStatus(no, status, v.reason, await requireAction('APPOINTMENTS_MANAGE'));
    revalidatePath('/appointments', 'layout');
    return ok;
  });
}
export async function bookFollowUpRequest(visitNo: string, v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await appts.bookFollowUp(visitNo, v, await requireAction('APPOINTMENTS_MANAGE')); refreshVisit(visitNo); revalidatePath('/appointments', 'layout'); return r; });
}
export async function freeSlotsRequest(date: string, department: string, clinicianId: number | null): Promise<ActionResult<string[]>> {
  return actionResult(async () => { await requireAction('APPOINTMENTS_READ'); return appts.freeSlots(String(date), String(department), clinicianId ? Number(clinicianId) : null); });
}

/* ------------------------------------------------------------------ visits & queues */

export async function checkInRequest(v: FormValues): Promise<ActionResult<{ no: string; queueNo: string | null }>> {
  return actionResult(async () => {
    const r = await visits.checkIn(v, await requireAction('VISITS_CHECK_IN'));
    refreshVisit(); refreshPatient(); revalidatePath('/appointments', 'layout');
    return r;
  });
}
export async function cancelVisitRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await visits.cancelVisit(no, v.reason, await requireAction('VISITS_CHECK_IN')); refreshVisit(no); return ok; });
}
export async function recordTriageRequest(no: string, v: FormValues): Promise<ActionResult<{ acuity: string }>> {
  return actionResult(async () => { const r = await visits.recordTriage(no, v, await requireAction('TRIAGE_RECORD')); refreshVisit(no); return r; });
}
export async function routeVisitRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await visits.routeVisit(no, v, await requireAction('QUEUES_WORK')); refreshVisit(no); return ok; });
}
export async function completeVisitRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await visits.completeVisitClinically(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); return ok; });
}
export async function queueActionRequest(entryId: number, status: 'CALLED' | 'SERVING' | 'DONE' | 'SKIPPED' | 'WAITING'): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => {
    if (!['CALLED', 'SERVING', 'DONE', 'SKIPPED', 'WAITING'].includes(status)) throw new Error('Invalid status');
    await visits.setQueueStatus(Number(entryId), status, await requireAction('QUEUES_WORK'));
    refreshVisit();
    return ok;
  });
}
export async function callNextRequest(department: string): Promise<ActionResult<{ queueNo: string; visitNo: string } | null>> {
  return actionResult(async () => { const r = await visits.callNext(String(department), await requireAction('QUEUES_WORK')); refreshVisit(); return r; });
}

/* ------------------------------------------------------------------ consultation & orders */

export async function saveConsultationRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await consult.saveConsultation(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); return ok; });
}
export async function addDiagnosisRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await consult.addDiagnosis(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); return ok; });
}
export async function removeDiagnosisRequest(id: number, no: string): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await consult.removeDiagnosis(Number(id), await requireAction('CONSULTATION_WORK')); refreshVisit(no); return ok; });
}
export async function searchIcdRequest(q: string): Promise<ActionResult<{ code: string; title: string }[]>> {
  return actionResult(async () => { await requireAction('VISITS_READ'); return setup.searchIcd(String(q ?? '')); });
}
export async function orderLabRequest(no: string, v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await consult.orderLabTests(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); revalidatePath('/laboratory', 'layout'); return r; });
}
export async function orderImagingRequest(no: string, v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await consult.orderImaging(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); revalidatePath('/imaging', 'layout'); return r; });
}
export async function prescribeRequest(no: string, lines: PrescriptionDraftLine[], notes: string): Promise<ActionResult<{ no: string; allergyWarnings: string[] }>> {
  return actionResult(async () => {
    const r = await consult.prescribe(no, Array.isArray(lines) ? lines.slice(0, 25) : [], notes, await requireAction('CONSULTATION_WORK'));
    refreshVisit(no); revalidatePath('/pharmacy', 'layout');
    return r;
  });
}
export async function orderProcedureRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await consult.orderProcedure(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); revalidatePath('/procedures'); return ok; });
}
export async function completeProcedureRequest(id: number, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await consult.completeProcedure(Number(id), v.notes, await requireAction('PROCEDURES_WORK')); refreshVisit(); revalidatePath('/procedures'); return ok; });
}
export async function issueDocumentRequest(no: string, v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await consult.issueDocument(no, v, await requireAction('CONSULTATION_WORK')); refreshVisit(no); return r; });
}

/* ------------------------------------------------------------------ billing & cashier */

export async function addChargeRequest(visitNo: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await billing.addManualCharge(visitNo, v, await requireAction('CASHIER_BILL')); refreshVisit(visitNo); revalidatePath('/cashier', 'layout'); return ok; });
}
export async function cancelChargeRequest(chargeId: number, visitNo: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await billing.cancelCharge(Number(chargeId), v.reason, await requireAction('CASHIER_BILL')); refreshVisit(visitNo); return ok; });
}
export async function discountChargeRequest(chargeId: number, visitNo: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await billing.discountCharge(Number(chargeId), v, await requireAction('CASHIER_DISCOUNT')); refreshVisit(visitNo); return ok; });
}
export async function finaliseBillRequest(visitNo: string): Promise<ActionResult<{ billNo: string; claimNo: string | null; balance: number }>> {
  return actionResult(async () => {
    const r = await billing.finaliseBill(visitNo, await requireAction('CASHIER_BILL'));
    refreshVisit(visitNo); revalidatePath('/cashier', 'layout'); revalidatePath('/claims', 'layout');
    return r;
  });
}
export async function receivePaymentRequest(visitNo: string, v: FormValues): Promise<ActionResult<{ no: string; change: number; balance: number }>> {
  return actionResult(async () => {
    const r = await billing.receivePayment(visitNo, v, await requireAction('CASHIER_RECEIVE'));
    refreshVisit(visitNo); revalidatePath('/cashier', 'layout');
    return r;
  });
}
export async function voidPaymentRequest(receiptNo: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await billing.voidPayment(receiptNo, v.reason, await requireAction('CASHIER_VOID')); refreshVisit(); revalidatePath('/cashier', 'layout'); return ok; });
}

/* ------------------------------------------------------------------ laboratory */

export async function collectSpecimensRequest(ids: number[]): Promise<ActionResult<{ specimens: string[] }>> {
  return actionResult(async () => {
    const r = await lab.collectSpecimens((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 50), await requireAction('LAB_WORK'));
    revalidatePath('/laboratory', 'layout'); refreshVisit();
    return r;
  });
}
export async function enterResultsRequest(orderTestId: number, v: FormValues): Promise<ActionResult<{ critical: string[]; autoVerified: boolean }>> {
  return actionResult(async () => { const r = await lab.enterResults(Number(orderTestId), v, await requireAction('LAB_WORK')); revalidatePath('/laboratory', 'layout'); refreshVisit(); return r; });
}
export async function verifyResultsRequest(ids: number[]): Promise<ActionResult<{ verified: number }>> {
  return actionResult(async () => {
    const r = await lab.verifyResults((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 100), await requireAction('LAB_VERIFY'));
    revalidatePath('/laboratory', 'layout'); refreshVisit();
    return r;
  });
}
export async function rejectResultRequest(orderTestId: number, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await lab.rejectResult(Number(orderTestId), v.reason, await requireAction('LAB_VERIFY')); revalidatePath('/laboratory', 'layout'); return ok; });
}

/* ------------------------------------------------------------------ imaging */

export async function imagingPerformedRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await imaging.markPerformed(no, v, await requireAction('IMAGING_WORK')); revalidatePath('/imaging', 'layout'); return ok; });
}
export async function imagingReportRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await imaging.reportStudy(no, v, await requireAction('IMAGING_WORK')); revalidatePath('/imaging', 'layout'); refreshVisit(); return ok; });
}

/* ------------------------------------------------------------------ pharmacy */

export async function dispenseRequest(rxNo: string, v: FormValues): Promise<ActionResult<{ dispensed: number; outOfStock: number }>> {
  return actionResult(async () => { const r = await pharmacy.dispense(rxNo, v, await requireAction('PHARMACY_DISPENSE')); revalidatePath('/pharmacy', 'layout'); refreshVisit(); return r; });
}
export async function cancelRxLineRequest(lineId: number, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await pharmacy.cancelPrescriptionLine(Number(lineId), v.reason, await requireAction('PHARMACY_DISPENSE')); revalidatePath('/pharmacy', 'layout'); return ok; });
}

/* ------------------------------------------------------------------ dental */

export async function recordFindingRequest(patientId: number, path: string, v: FormValues): Promise<ActionResult<{ teeth: number }>> {
  return actionResult(async () => { const r = await dental.recordFinding(Number(patientId), v, await requireAction('DENTAL_WORK')); revalidatePath(path); return r; });
}
export async function createPlanRequest(patientId: number, path: string, v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await dental.createPlan(Number(patientId), v, await requireAction('DENTAL_WORK')); revalidatePath(path); revalidatePath('/dental'); return r; });
}
export async function addPlanItemRequest(planNo: string, path: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await dental.addPlanItem(planNo, v, await requireAction('DENTAL_WORK')); revalidatePath(path); return ok; });
}
export async function planStatusRequest(planNo: string, status: 'ACCEPTED' | 'CANCELLED', path: string): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => {
    if (status !== 'ACCEPTED' && status !== 'CANCELLED') throw new Error('Invalid status');
    await dental.setPlanStatus(planNo, status, await requireAction('DENTAL_WORK')); revalidatePath(path); revalidatePath('/dental');
    return ok;
  });
}
export async function completePlanItemRequest(itemId: number, path: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await dental.completePlanItem(Number(itemId), v, await requireAction('DENTAL_WORK')); revalidatePath(path); refreshVisit(); return ok; });
}
export async function cancelPlanItemRequest(itemId: number, path: string): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await dental.cancelPlanItem(Number(itemId), await requireAction('DENTAL_WORK')); revalidatePath(path); return ok; });
}

/* ------------------------------------------------------------------ claims */

export async function submitClaimsRequest(nos: string[], batch: string): Promise<ActionResult<{ submitted: number; batch: string }>> {
  return actionResult(async () => {
    const r = await claims.submitClaims((Array.isArray(nos) ? nos : []).map(String).slice(0, 500), batch, await requireAction('CLAIMS_MANAGE'));
    revalidatePath('/claims', 'layout');
    return r;
  });
}
export async function decideClaimRequest(no: string, v: FormValues): Promise<ActionResult<{ invoiceNo: string | null }>> {
  return actionResult(async () => { const r = await claims.decideClaim(no, v, await requireAction('CLAIMS_MANAGE')); revalidatePath('/claims', 'layout'); revalidatePath('/receivables', 'layout'); return r; });
}
export async function requestPreauthRequest(visitNo: string, v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => { const r = await claims.requestPreauth(visitNo, v, await requireAction('CLAIMS_MANAGE')); refreshVisit(visitNo); revalidatePath('/claims', 'layout'); return r; });
}
export async function decidePreauthRequest(no: string, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await claims.decidePreauth(no, v, await requireAction('CLAIMS_MANAGE')); revalidatePath('/claims', 'layout'); refreshVisit(); return ok; });
}

/* ------------------------------------------------------------------ setup */

export async function saveClinicSetupRequest(v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await setup.updateClinicSetup(v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return ok; });
}
export async function saveDepartmentRequest(code: string | null, v: FormValues): Promise<ActionResult<{ code: string }>> {
  return actionResult(async () => { const r = await setup.saveDepartment(code, v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return r; });
}
export async function saveServiceItemRequest(code: string | null, v: FormValues): Promise<ActionResult<{ code: string }>> {
  return actionResult(async () => { const r = await setup.saveServiceItem(code, v, await requireAction('CLINIC_PRICES_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return r; });
}
export async function savePriceListRequest(code: string | null, v: FormValues): Promise<ActionResult<{ code: string }>> {
  return actionResult(async () => { const r = await setup.savePriceList(code, v, await requireAction('CLINIC_PRICES_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return r; });
}
export async function setPriceRequest(list: string, serviceItemId: number, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await setup.setPriceListLine(list, Number(serviceItemId), v.price, await requireAction('CLINIC_PRICES_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return ok; });
}
export async function saveSchemeRequest(id: number | null, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => { const r = await setup.saveScheme(id, v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return r; });
}
export async function saveLabTestRequest(id: number | null, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => { const r = await setup.saveLabTest(id, v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return r; });
}
export async function saveLabParameterRequest(testId: number, paramId: number | null, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await setup.saveLabParameter(Number(testId), paramId ? Number(paramId) : null, v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return ok; });
}
export async function deleteLabParameterRequest(testId: number, paramId: number): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await setup.deleteLabParameter(Number(testId), Number(paramId), await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return ok; });
}
export async function saveDrugRequest(id: number | null, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => { const r = await setup.saveDrug(id, v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); revalidatePath('/pharmacy', 'layout'); return r; });
}
export async function addIcdRequest(v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => { await setup.addIcd(v, await requireAction('CLINIC_SETUP_MANAGE')); revalidatePath('/clinic-setup', 'layout'); return ok; });
}

/** Polled by the queue display and the reception board. */
export async function queueSnapshotRequest(): Promise<ActionResult<{ display: Awaited<ReturnType<typeof visits.queueDisplay>>; counts: Awaited<ReturnType<typeof visits.queueCounts>> }>> {
  return actionResult(async () => { await requireUser(); return { display: await visits.queueDisplay(), counts: await visits.queueCounts() }; });
}
