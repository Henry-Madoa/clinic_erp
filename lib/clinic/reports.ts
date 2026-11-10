/*
 * Clinical and operational analytics — the clinic's own numbers, read straight from the visit,
 * billing and clinical tables (the financial statements come from the ledger, lib/reports.ts).
 *
 *   - Census: visits per day by department, new vs returning, payment mode, waiting times.
 *   - Revenue: billed by category and payer, collections by method, average bill.
 *   - Morbidity: top diagnoses (ICD-10), the MOH 705-style under-5 / 5+ split.
 *   - Service points: lab turnaround against target, imaging volumes, dental procedures, drugs.
 *   - Payers: claims outstanding and rejection rate by scheme.
 *   - Clinicians: patients seen and revenue generated.
 */
import { one, all } from '../db.ts';
import { addDays } from '../dateFormula.ts';
import { todayIso } from '../input.ts';
import type { Cents } from '../types.ts';

export interface DateRange { from: string; to: string }

export const defaultRange = (): DateRange => ({ from: addDays(todayIso(), -29), to: todayIso() });

export async function clinicKpis({ from, to }: DateRange) {
  const r = await one<{
    visits: number; patients: number; new_patients: number; revenue: Cents; collected: Cents; avg_bill: Cents; insured_share: number;
    avg_wait: number | null; lab_tests: number; rx: number; dental: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM visit WHERE visit_date BETWEEN @from AND @to AND status <> 'CANCELLED') AS visits,
       (SELECT COUNT(DISTINCT patient_id)::int FROM visit WHERE visit_date BETWEEN @from AND @to AND status <> 'CANCELLED') AS patients,
       (SELECT COUNT(*)::int FROM visit WHERE visit_date BETWEEN @from AND @to AND visit_type = 'NEW' AND status <> 'CANCELLED') AS new_patients,
       (SELECT COALESCE(SUM(net),0) FROM patient_bill WHERE status = 'FINAL' AND bill_date BETWEEN @from AND @to) AS revenue,
       (SELECT COALESCE(SUM(amount),0) FROM patient_payment WHERE status = 'POSTED' AND payment_date BETWEEN @from AND @to) AS collected,
       (SELECT COALESCE(AVG(net),0)::bigint FROM patient_bill WHERE status = 'FINAL' AND bill_date BETWEEN @from AND @to) AS avg_bill,
       (SELECT COALESCE(100.0 * SUM(scheme_share) / NULLIF(SUM(net),0), 0)::float FROM patient_bill WHERE status = 'FINAL' AND bill_date BETWEEN @from AND @to) AS insured_share,
       (SELECT AVG(EXTRACT(EPOCH FROM (q.called_at::timestamptz - q.entered_at::timestamptz)) / 60)::float FROM visit_queue q
          WHERE q.called_at IS NOT NULL AND substr(q.entered_at,1,10) BETWEEN @from AND @to AND q.department_code NOT IN ('CASH')) AS avg_wait,
       (SELECT COUNT(*)::int FROM lab_order_test ot JOIN lab_order o ON o.id = ot.lab_order_id WHERE substr(o.ordered_at,1,10) BETWEEN @from AND @to AND ot.status <> 'CANCELLED') AS lab_tests,
       (SELECT COUNT(*)::int FROM prescription WHERE substr(prescribed_at,1,10) BETWEEN @from AND @to AND status <> 'CANCELLED') AS rx,
       (SELECT COUNT(*)::int FROM dental_treatment_item WHERE status = 'COMPLETED' AND substr(completed_at,1,10) BETWEEN @from AND @to) AS dental`,
    { from, to },
  );
  return r!;
}

/** Visits per day, split by department (for a stacked trend). */
export const dailyCensus = ({ from, to }: DateRange) => all<{ day: string; department: string; colour: string; n: number }>(
  `SELECT v.visit_date AS day, d.name AS department, d.colour, COUNT(*)::int AS n FROM visit v JOIN clinic_department d ON d.code = v.department_code
   WHERE v.visit_date BETWEEN @from AND @to AND v.status <> 'CANCELLED' GROUP BY v.visit_date, d.name, d.colour ORDER BY v.visit_date`, { from, to },
);

export const visitsByDepartment = ({ from, to }: DateRange) => all<{ department: string; colour: string; visits: number; new_visits: number; revenue: Cents }>(
  `SELECT d.name AS department, d.colour, COUNT(v.id)::int AS visits, COUNT(v.id) FILTER (WHERE v.visit_type = 'NEW')::int AS new_visits,
          COALESCE(SUM(b.net), 0) AS revenue
   FROM clinic_department d JOIN visit v ON v.department_code = d.code AND v.visit_date BETWEEN @from AND @to AND v.status <> 'CANCELLED'
   LEFT JOIN patient_bill b ON b.visit_id = v.id AND b.status = 'FINAL' GROUP BY d.name, d.colour ORDER BY visits DESC`, { from, to },
);

export const revenueByCategory = ({ from, to }: DateRange) => all<{ category: string; amount: Cents; lines: number }>(
  `SELECT COALESCE(cat.name, 'Other') AS category, COALESCE(SUM(c.amount - c.discount), 0) AS amount, COUNT(*)::int AS lines
   FROM patient_charge c JOIN patient_bill b ON b.id = c.bill_id LEFT JOIN service_item s ON s.id = c.service_item_id LEFT JOIN service_category cat ON cat.code = s.category_code
   WHERE c.status = 'BILLED' AND b.bill_date BETWEEN @from AND @to GROUP BY cat.name ORDER BY amount DESC`, { from, to },
);

export const revenueByPayer = ({ from, to }: DateRange) => all<{ payer: string; visits: number; amount: Cents }>(
  `SELECT payer, COUNT(*)::int AS visits, SUM(amount)::bigint AS amount FROM (
     SELECT COALESCE(s.name, 'Cash patients') AS payer, b.scheme_share AS amount FROM patient_bill b LEFT JOIN insurance_scheme s ON s.id = b.scheme_id
       WHERE b.status = 'FINAL' AND b.bill_date BETWEEN @from AND @to AND b.scheme_share > 0
     UNION ALL
     SELECT 'Patients (cash & co-pay)', b.patient_share FROM patient_bill b WHERE b.status = 'FINAL' AND b.bill_date BETWEEN @from AND @to AND b.patient_share > 0
   ) x GROUP BY payer ORDER BY amount DESC`, { from, to },
);

export const collectionsByMethod = ({ from, to }: DateRange) => all<{ method: string; amount: Cents; n: number }>(
  "SELECT method, COALESCE(SUM(amount),0) AS amount, COUNT(*)::int AS n FROM patient_payment WHERE status = 'POSTED' AND payment_date BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC", from, to,
);

export const monthlyRevenue = (months = 12) => all<{ month: string; billed: Cents; collected: Cents; visits: number }>(
  `WITH m AS (SELECT to_char(date_trunc('month', current_date) - (n || ' months')::interval, 'YYYY-MM') AS month FROM generate_series(0, ${Math.min(Math.max(months, 1), 36) - 1}) n)
   SELECT m.month,
          COALESCE((SELECT SUM(net) FROM patient_bill b WHERE b.status = 'FINAL' AND substr(b.bill_date,1,7) = m.month), 0) AS billed,
          COALESCE((SELECT SUM(amount) FROM patient_payment p WHERE p.status = 'POSTED' AND substr(p.payment_date,1,7) = m.month), 0) AS collected,
          (SELECT COUNT(*)::int FROM visit v WHERE v.status <> 'CANCELLED' AND substr(v.visit_date,1,7) = m.month) AS visits
   FROM m ORDER BY m.month`,
);

/** Top diagnoses, with the MOH 705A (under 5) / 705B (5 and over) split. */
export const topDiagnoses = ({ from, to }: DateRange, limit = 15) => all<{ icd_code: string | null; description: string; total: number; under5: number; over5: number; female: number; male: number }>(
  `SELECT dx.icd_code, MIN(dx.description) AS description, COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE p.date_of_birth IS NOT NULL AND age(v.visit_date::date, p.date_of_birth::date) < interval '5 years')::int AS under5,
          COUNT(*) FILTER (WHERE p.date_of_birth IS NULL OR age(v.visit_date::date, p.date_of_birth::date) >= interval '5 years')::int AS over5,
          COUNT(*) FILTER (WHERE p.sex = 'FEMALE')::int AS female, COUNT(*) FILTER (WHERE p.sex = 'MALE')::int AS male
   FROM diagnosis dx JOIN visit v ON v.id = dx.visit_id JOIN patient p ON p.id = v.patient_id
   WHERE v.visit_date BETWEEN @from AND @to AND v.status <> 'CANCELLED' AND dx.diagnosis_type <> 'PROVISIONAL'
   GROUP BY COALESCE(dx.icd_code, lower(dx.description)), dx.icd_code ORDER BY total DESC LIMIT ${Math.min(limit, 100)}`, { from, to },
);

/** Lab turnaround: order to release, against each test's target. */
export const labTurnaround = ({ from, to }: DateRange) => all<{ test: string; section: string; n: number; avg_mins: number; target: number; within: number }>(
  `SELECT t.name AS test, t.section, COUNT(*)::int AS n,
          AVG(EXTRACT(EPOCH FROM (ot.verified_at::timestamptz - o.ordered_at::timestamptz)) / 60)::int AS avg_mins, MIN(t.tat_minutes) AS target,
          COUNT(*) FILTER (WHERE ot.verified_at::timestamptz <= o.ordered_at::timestamptz + (t.tat_minutes || ' minutes')::interval)::int AS within
   FROM lab_order_test ot JOIN lab_order o ON o.id = ot.lab_order_id JOIN lab_test t ON t.id = ot.lab_test_id
   WHERE ot.status = 'VERIFIED' AND substr(o.ordered_at,1,10) BETWEEN @from AND @to GROUP BY t.name, t.section ORDER BY n DESC LIMIT 40`, { from, to },
);

export const dentalProcedures = ({ from, to }: DateRange) => all<{ procedure: string; n: number; amount: Cents }>(
  `SELECT i.description AS procedure, COUNT(*)::int AS n, COALESCE(SUM(i.fee), 0) AS amount FROM dental_treatment_item i
   WHERE i.status = 'COMPLETED' AND substr(i.completed_at,1,10) BETWEEN @from AND @to GROUP BY i.description ORDER BY n DESC LIMIT 25`, { from, to },
);

export const clinicianActivity = ({ from, to }: DateRange) => all<{ clinician: string; visits: number; revenue: Cents; diagnoses: number }>(
  `SELECT u.full_name AS clinician, COUNT(DISTINCT v.id)::int AS visits, COALESCE(SUM(DISTINCT b.net), 0) AS revenue,
          (SELECT COUNT(*)::int FROM diagnosis dx JOIN visit v2 ON v2.id = dx.visit_id WHERE v2.clinician_user_id = u.id AND v2.visit_date BETWEEN @from AND @to) AS diagnoses
   FROM visit v JOIN app_user u ON u.id = v.clinician_user_id LEFT JOIN patient_bill b ON b.visit_id = v.id AND b.status = 'FINAL'
   WHERE v.visit_date BETWEEN @from AND @to AND v.status <> 'CANCELLED' GROUP BY u.id, u.full_name ORDER BY visits DESC`, { from, to },
);

export const claimPerformance = ({ from, to }: DateRange) => all<{ scheme: string; claims: number; claimed: Cents; approved: Cents; rejected: Cents; pending: Cents; avg_days: number | null }>(
  `SELECT s.name AS scheme, COUNT(c.id)::int AS claims, COALESCE(SUM(c.amount), 0) AS claimed,
          COALESCE(SUM(c.approved_amount), 0) AS approved,
          COALESCE(SUM(c.amount - c.approved_amount) FILTER (WHERE c.status IN ('PARTIAL','REJECTED')), 0) AS rejected,
          COALESCE(SUM(c.amount) FILTER (WHERE c.status IN ('DRAFT','SUBMITTED')), 0) AS pending,
          AVG((c.decided_at::date - c.claim_date::date)) FILTER (WHERE c.decided_at IS NOT NULL)::float AS avg_days
   FROM insurance_claim c JOIN insurance_scheme s ON s.id = c.scheme_id WHERE c.claim_date BETWEEN @from AND @to GROUP BY s.name ORDER BY claimed DESC`, { from, to },
);

export const ageSexProfile = ({ from, to }: DateRange) => all<{ band: string; female: number; male: number }>(
  `SELECT band, COUNT(*) FILTER (WHERE sex = 'FEMALE')::int AS female, COUNT(*) FILTER (WHERE sex = 'MALE')::int AS male FROM (
     SELECT p.sex, CASE WHEN p.date_of_birth IS NULL THEN 'Unknown'
       WHEN age(v.visit_date::date, p.date_of_birth::date) < interval '5 years' THEN '0–4'
       WHEN age(v.visit_date::date, p.date_of_birth::date) < interval '15 years' THEN '5–14'
       WHEN age(v.visit_date::date, p.date_of_birth::date) < interval '25 years' THEN '15–24'
       WHEN age(v.visit_date::date, p.date_of_birth::date) < interval '45 years' THEN '25–44'
       WHEN age(v.visit_date::date, p.date_of_birth::date) < interval '65 years' THEN '45–64' ELSE '65+' END AS band
     FROM visit v JOIN patient p ON p.id = v.patient_id WHERE v.visit_date BETWEEN @from AND @to AND v.status <> 'CANCELLED') x
   GROUP BY band ORDER BY CASE band WHEN '0–4' THEN 0 WHEN '5–14' THEN 1 WHEN '15–24' THEN 2 WHEN '25–44' THEN 3 WHEN '45–64' THEN 4 WHEN '65+' THEN 5 ELSE 6 END`, { from, to },
);

/** Today at a glance — the role centres' tiles. */
export async function todayAtAGlance() {
  const t = todayIso();
  const r = await one<{ checked_in: number; open: number; waiting: number; seen: number; booked: number; revenue: Cents; collected: Cents; lab_pending: number; rx_pending: number; claims_draft: number }>(
    `SELECT (SELECT COUNT(*)::int FROM visit WHERE visit_date = @t AND status <> 'CANCELLED') AS checked_in,
            (SELECT COUNT(*)::int FROM visit WHERE status = 'OPEN') AS open,
            (SELECT COUNT(*)::int FROM visit_queue WHERE status = 'WAITING') AS waiting,
            (SELECT COUNT(*)::int FROM visit WHERE visit_date = @t AND status = 'CLOSED') AS seen,
            (SELECT COUNT(*)::int FROM appointment WHERE appointment_date = @t AND status IN ('BOOKED','CONFIRMED')) AS booked,
            (SELECT COALESCE(SUM(amount - discount),0) FROM patient_charge c JOIN visit v ON v.id = c.visit_id WHERE v.visit_date = @t AND c.status <> 'CANCELLED') AS revenue,
            (SELECT COALESCE(SUM(amount),0) FROM patient_payment WHERE payment_date = @t AND status = 'POSTED') AS collected,
            (SELECT COUNT(*)::int FROM lab_order_test WHERE status IN ('ORDERED','COLLECTED','RESULTED')) AS lab_pending,
            (SELECT COUNT(*)::int FROM prescription p JOIN visit v ON v.id = p.visit_id WHERE p.status IN ('PENDING','PARTIAL') AND v.status = 'OPEN') AS rx_pending,
            (SELECT COUNT(*)::int FROM insurance_claim WHERE status = 'DRAFT') AS claims_draft`, { t },
  );
  return r!;
}

/** Visits per hour of the day today (the reception's arrival curve). */
export const arrivalsByHour = (date = todayIso()) => all<{ hour: number; n: number }>(
  `SELECT (substr(check_in_at, 12, 2)::int + 3) % 24 AS hour, COUNT(*)::int AS n FROM visit WHERE visit_date = ? AND status <> 'CANCELLED' GROUP BY hour ORDER BY hour`, date,
);
