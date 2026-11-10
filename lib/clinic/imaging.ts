/*
 * Imaging & radiology — X-ray, ultrasound, dental OPG / CBCT and ECG studies ordered from a visit:
 * ORDERED → PERFORMED (the radiographer takes it; images may be attached) → REPORTED (findings and
 * impression by the reporting clinician). A reported study releases the patient back to the clinician.
 */
import { one, all, run, tx, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, nowIso, q as qText } from '../input.ts';
import { notify } from '../notifications.ts';
import { enqueue } from './visits.ts';
import { AGE_SQL, NAME_SQL } from './patients.ts';
import type { Actor, ImagingOrder } from '../types.ts';

const SELECT = `
  SELECT o.*, s.name AS service_name, v.no AS visit_no, p.mrn, ${NAME_SQL()} AS patient_name, p.sex, ${AGE_SQL()} AS age
  FROM imaging_order o JOIN service_item s ON s.id = o.service_item_id JOIN visit v ON v.id = o.visit_id JOIN patient p ON p.id = o.patient_id`;

export async function imagingWorklist(view: 'pending' | 'reporting' | 'done', q = ''): Promise<ImagingOrder[]> {
  const where = view === 'pending' ? "o.status = 'ORDERED'" : view === 'reporting' ? "o.status = 'PERFORMED'"
    : "o.status = 'REPORTED' AND substr(o.reported_at,1,10) >= to_char(current_date - 30, 'YYYY-MM-DD')";
  return all<ImagingOrder>(
    `${SELECT} WHERE ${where} AND v.status <> 'CANCELLED' AND (@q = '' OR o.no ILIKE '%' || @q || '%' OR p.mrn ILIKE '%' || @q || '%' OR ${NAME_SQL()} ILIKE '%' || @q || '%')
     ORDER BY CASE o.priority WHEN 'STAT' THEN 0 WHEN 'URGENT' THEN 1 ELSE 2 END, ${view === 'done' ? 'o.reported_at DESC' : 'o.ordered_at'} LIMIT 300`, { q: qText(q) },
  );
}

export async function markPerformed(no: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const r = await run("UPDATE imaging_order SET status = 'PERFORMED', performed_at = ?, performed_by = ?, image_url = COALESCE(?, image_url) WHERE no = ? AND status = 'ORDERED'",
    nowIso(), user.username, imageUrl(v.image_url), no);
  if (!r.changes) throw new AppError('Only an ordered study can be marked performed', 'VALIDATION');
  await audit(user, 'IMAGING_PERFORMED', 'imaging_order', no);
}

function imageUrl(raw: unknown): string | null {
  const u = text(raw, 'Image link', { max: 500 });
  if (u && !/^https:\/\/res\.cloudinary\.com\//.test(u)) throw new AppError('Images are uploaded to the media store', 'VALIDATION');
  return u;
}

export async function reportStudy(no: string, v: Record<string, unknown>, user: Actor): Promise<void> {
  const findings = req(v.findings, 'Findings', 8000);
  const impression = req(v.impression, 'Impression', 2000);
  const r = await tx(async () => {
    const o = await one<{ id: number; status: string; visit_id: number }>('SELECT id, status, visit_id FROM imaging_order WHERE no = ?', no);
    if (!o) throw new AppError('Study not found', 'NOT_FOUND');
    if (o.status === 'ORDERED') await run("UPDATE imaging_order SET status = 'PERFORMED', performed_at = ?, performed_by = ? WHERE id = ?", nowIso(), user.username, o.id);
    else if (o.status !== 'PERFORMED') throw new AppError('This study is already reported or cancelled', 'VALIDATION');
    await run("UPDATE imaging_order SET status = 'REPORTED', findings = ?, impression = ?, image_url = COALESCE(?, image_url), reported_at = ?, reported_by = ? WHERE id = ?",
      findings, impression, imageUrl(v.image_url), nowIso(), user.username, o.id);
    const pending = await one("SELECT 1 FROM imaging_order WHERE visit_id = ? AND status IN ('ORDERED','PERFORMED')", o.visit_id);
    if (!pending) {
      await run("UPDATE visit_queue SET status = 'DONE', completed_at = ? WHERE visit_id = ? AND department_code = 'RAD' AND status IN ('WAITING','CALLED','SERVING')", nowIso(), o.visit_id);
      const v2 = await one<{ no: string; status: string; stage: string; department_code: string; clinician_user_id: number | null }>(
        'SELECT no, status, stage, department_code, clinician_user_id FROM visit WHERE id = ?', o.visit_id);
      const labPending = await one("SELECT 1 FROM lab_order_test ot JOIN lab_order lo ON lo.id = ot.lab_order_id WHERE lo.visit_id = ? AND ot.status IN ('ORDERED','COLLECTED','RESULTED')", o.visit_id);
      if (v2 && v2.status === 'OPEN' && v2.stage === 'INVESTIGATION' && !labPending) {
        await run("UPDATE visit SET stage = 'CONSULTATION' WHERE id = ?", o.visit_id);
        await enqueue(o.visit_id, v2.department_code);
      }
      return v2;
    }
    return null;
  });
  if (r?.clinician_user_id) await notify(r.clinician_user_id, 'LAB_RESULT_READY', `Imaging reported — ${no}`, impression.slice(0, 140), `/visits/${r.no}/results`);
  await audit(user, 'IMAGING_REPORT', 'imaging_order', no);
}
