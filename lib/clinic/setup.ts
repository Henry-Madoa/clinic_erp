/*
 * Clinic Setup — the reference data every clinical and billing screen runs on.
 *
 *   - Clinic Setup (singleton): posting accounts, cashier bank accounts, the pharmacy store and the
 *     clinical policies (pay before service, lab verification, review window, booking hours).
 *   - Departments: clinics that see patients and the service points that work orders.
 *   - The charge master (service_item) grouped into revenue categories, priced per price list.
 *   - Payers (insurance_scheme): each billed through its own Receivables customer.
 *   - The laboratory catalogue (tests and their parameters / reference ranges).
 *   - The drug formulary over inventory items.
 *
 * Pricing: a visit is priced on one price list (Cash, or the scheme's). A list line wins; otherwise
 * the charge-master base price plus the list's markup.
 */
import { one, all, run, tx, audit } from '../db.ts';
import { AppError } from '../errors.ts';
import { text, req, int, num, money, pick, flag, optId, email, q as qText, nowIso } from '../input.ts';
import { createCustomer } from '../customers.ts';
import { createItem } from '../items.ts';
import type {
  Actor, Cents, ClinicDepartment, ClinicSetup, Drug, InsuranceScheme, LabTest, LabTestParameter, PriceList, ServiceCategory, ServiceItem, ServiceKind,
} from '../types.ts';

export const SERVICE_KINDS: ServiceKind[] = ['CONSULTATION', 'REGISTRATION', 'LAB', 'IMAGING', 'DENTAL', 'PROCEDURE', 'NURSING', 'DRUG', 'CONSUMABLE', 'OTHER'];
export const PAYER_TYPES = ['INSURER', 'SHA', 'CORPORATE', 'GOVERNMENT'] as const;
export const COPAY_TYPES = ['NONE', 'FIXED', 'PERCENT'] as const;
export const LAB_SECTIONS = ['HAEMATOLOGY', 'BIOCHEMISTRY', 'MICROBIOLOGY', 'PARASITOLOGY', 'SEROLOGY', 'URINALYSIS', 'IMMUNOLOGY', 'HORMONES'] as const;
export const SPECIMEN_TYPES = ['BLOOD', 'SERUM', 'PLASMA', 'URINE', 'STOOL', 'SWAB', 'SPUTUM', 'CSF'] as const;
export const DOSAGE_FORMS = ['TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'CREAM', 'OINTMENT', 'DROPS', 'INHALER', 'SUPPOSITORY', 'MOUTHWASH', 'GEL'] as const;
export const ROUTES = ['PO', 'IV', 'IM', 'SC', 'TOP', 'INH', 'PR', 'SL', 'OPHTH', 'OTIC', 'NASAL', 'BUCCAL'] as const;
export const FREQUENCIES: { code: string; label: string; perDay: number }[] = [
  { code: 'OD', label: 'Once daily', perDay: 1 }, { code: 'BD', label: 'Twice daily', perDay: 2 },
  { code: 'TDS', label: 'Three times daily', perDay: 3 }, { code: 'QID', label: 'Four times daily', perDay: 4 },
  { code: 'Q6H', label: 'Every 6 hours', perDay: 4 }, { code: 'Q8H', label: 'Every 8 hours', perDay: 3 },
  { code: 'NOCTE', label: 'At night', perDay: 1 }, { code: 'STAT', label: 'Immediately, once', perDay: 1 },
  { code: 'PRN', label: 'When required', perDay: 1 }, { code: 'WEEKLY', label: 'Once a week', perDay: 1 / 7 },
];

/* ------------------------------------------------------------------ setup */

export async function getClinicSetup(): Promise<ClinicSetup> {
  const s = await one<ClinicSetup>('SELECT * FROM clinic_setup WHERE id = 1');
  if (!s) throw new AppError('Clinic Setup has not been initialised', 'NOT_FOUND');
  return s;
}

export async function updateClinicSetup(v: Record<string, unknown>, user: Actor): Promise<void> {
  const time = (x: unknown, label: string): string => {
    const t = req(x, label, 5);
    if (!/^\d{2}:\d{2}$/.test(t)) throw new AppError(`${label} is HH:MM`, 'VALIDATION');
    return t;
  };
  const dayStart = time(v.day_start, 'Day starts');
  const dayEnd = time(v.day_end, 'Day ends');
  if (dayEnd <= dayStart) throw new AppError('The day must end after it starts', 'VALIDATION');
  await run(
    `UPDATE clinic_setup SET patient_receivable_account_id = ?, unbilled_claims_account_id = ?, discount_account_id = ?,
       claim_writeoff_account_id = ?, default_revenue_account_id = ?, cash_bank_account_id = ?, mpesa_bank_account_id = ?,
       card_bank_account_id = ?, bank_transfer_account_id = ?, pharmacy_location_id = ?, default_price_list_code = ?,
       registration_service_code = ?, pay_before_service = ?, lab_requires_verification = ?, review_window_days = ?,
       reminder_hours = ?, day_start = ?, day_end = ?, slot_minutes = ?, updated_at = ?, updated_by = ? WHERE id = 1`,
    optId(v.patient_receivable_account_id, 'Patient receivables'), optId(v.unbilled_claims_account_id, 'Unbilled claims'),
    optId(v.discount_account_id, 'Discounts'), optId(v.claim_writeoff_account_id, 'Claim write-offs'),
    optId(v.default_revenue_account_id, 'Default revenue'), optId(v.cash_bank_account_id, 'Cash till'),
    optId(v.mpesa_bank_account_id, 'M-Pesa'), optId(v.card_bank_account_id, 'Card'), optId(v.bank_transfer_account_id, 'Bank'),
    optId(v.pharmacy_location_id, 'Pharmacy store'), req(v.default_price_list_code, 'Default price list', 20),
    text(v.registration_service_code, 'Registration service', { max: 30 }), flag(v.pay_before_service), flag(v.lab_requires_verification),
    int(v.review_window_days || 0, 'Review window', 0, 90), int(v.reminder_hours || 24, 'Reminder hours', 1, 168),
    dayStart, dayEnd, int(v.slot_minutes || 20, 'Slot length', 5, 120), nowIso(), user.username,
  );
  await audit(user, 'CLINIC_SETUP_UPDATE', 'clinic_setup', 1);
}

/* ------------------------------------------------------------------ departments */

export const listDepartments = (activeOnly = false, kind?: 'CLINIC' | 'SERVICE'): Promise<ClinicDepartment[]> => all<ClinicDepartment>(
  `SELECT * FROM clinic_department WHERE (@active = 0 OR status = 'ACTIVE') AND (@kind = '' OR kind = @kind) ORDER BY sort_order, name`,
  { active: activeOnly ? 1 : 0, kind: kind ?? '' },
);
export const getDepartment = (code: string): Promise<ClinicDepartment | undefined> => one<ClinicDepartment>('SELECT * FROM clinic_department WHERE code = ?', code);

export async function saveDepartment(code: string | null, v: Record<string, unknown>, user: Actor): Promise<{ code: string }> {
  const name = req(v.name, 'Name', 80);
  const kind = pick(v.kind, ['CLINIC', 'SERVICE'] as const, 'Kind', 'CLINIC');
  const prefix = req(v.queue_prefix, 'Queue prefix', 4).toUpperCase();
  const colour = text(v.colour, 'Colour', { max: 7 }) ?? '#0E7490';
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) throw new AppError('Colour is a hex value like #0E7490', 'VALIDATION');
  const consult = text(v.consultation_service_code, 'Consultation service', { max: 30 });
  if (consult && !(await one("SELECT 1 FROM service_item WHERE code = ? AND kind = 'CONSULTATION'", consult))) {
    throw new AppError('The consultation charge must be a CONSULTATION service', 'VALIDATION');
  }
  const status = pick(v.status, ['ACTIVE', 'INACTIVE'] as const, 'Status', 'ACTIVE');
  if (code) {
    const r = await run(`UPDATE clinic_department SET name = ?, kind = ?, queue_prefix = ?, room = ?, colour = ?, consultation_service_code = ?, status = ?, sort_order = ?
                         WHERE code = ?`, name, kind, prefix, text(v.room, 'Room', { max: 40 }), colour, consult, status, int(v.sort_order || 0, 'Sort', 0, 999), code);
    if (!r.changes) throw new AppError('Department not found', 'NOT_FOUND');
    await audit(user, 'DEPARTMENT_UPDATE', 'clinic_department', code);
    return { code };
  }
  const newCode = req(v.code, 'Code', 12).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (await getDepartment(newCode)) throw new AppError('That code is in use', 'VALIDATION');
  await run(`INSERT INTO clinic_department (code, name, kind, queue_prefix, room, colour, consultation_service_code, status, sort_order, created_at, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`, newCode, name, kind, prefix, text(v.room, 'Room', { max: 40 }), colour, consult, status,
  int(v.sort_order || 0, 'Sort', 0, 999), nowIso(), user.username);
  await audit(user, 'DEPARTMENT_CREATE', 'clinic_department', newCode);
  return { code: newCode };
}

/* ------------------------------------------------------------------ charge master */

export const listServiceCategories = (): Promise<ServiceCategory[]> => all<ServiceCategory>(
  'SELECT c.*, g.code AS revenue_account_code FROM service_category c LEFT JOIN gl_account g ON g.id = c.revenue_account_id ORDER BY c.sort_order, c.name',
);

export async function listServiceItems(opts: { q?: string; kind?: string; category?: string; activeOnly?: boolean } = {}): Promise<ServiceItem[]> {
  return all<ServiceItem>(
    `SELECT s.*, c.name AS category_name FROM service_item s JOIN service_category c ON c.code = s.category_code
     WHERE (@q = '' OR s.code ILIKE '%' || @q || '%' OR s.name ILIKE '%' || @q || '%')
       AND (@kind = '' OR s.kind = @kind) AND (@cat = '' OR s.category_code = @cat) AND (@active = 0 OR s.status = 'ACTIVE')
     ORDER BY c.sort_order, s.name LIMIT 1000`,
    { q: qText(opts.q), kind: opts.kind ?? '', cat: opts.category ?? '', active: opts.activeOnly ? 1 : 0 },
  );
}
const getServiceItem = (code: string): Promise<ServiceItem | undefined> => one<ServiceItem>('SELECT * FROM service_item WHERE code = ?', code);

export async function saveServiceItem(code: string | null, v: Record<string, unknown>, user: Actor): Promise<{ code: string }> {
  const name = req(v.name, 'Name', 120);
  const category = req(v.category_code, 'Category', 30);
  if (!(await one('SELECT 1 FROM service_category WHERE code = ?', category))) throw new AppError('Unknown category', 'VALIDATION');
  const kind = pick(v.kind, SERVICE_KINDS, 'Kind', 'OTHER');
  const dept = text(v.department_code, 'Department', { max: 12 });
  const price = money(v.base_price, 'Base price');
  const vat = text(v.vat_prod_posting_group_code, 'VAT group', { max: 20 }) ?? 'EXEMPT';
  const status = pick(v.status, ['ACTIVE', 'INACTIVE'] as const, 'Status', 'ACTIVE');
  const desc = text(v.description, 'Description', { max: 500 });
  if (code) {
    const r = await run(`UPDATE service_item SET name = ?, category_code = ?, kind = ?, department_code = ?, base_price = ?, vat_prod_posting_group_code = ?,
                         requires_preauth = ?, description = ?, status = ? WHERE code = ?`,
    name, category, kind, dept, price, vat, flag(v.requires_preauth), desc, status, code);
    if (!r.changes) throw new AppError('Service not found', 'NOT_FOUND');
    await audit(user, 'SERVICE_ITEM_UPDATE', 'service_item', code, { price });
    return { code };
  }
  const newCode = req(v.code, 'Code', 30).toUpperCase().replace(/\s+/g, '-');
  if (await getServiceItem(newCode)) throw new AppError('That code is in use', 'VALIDATION');
  await run(`INSERT INTO service_item (code, name, category_code, kind, department_code, base_price, vat_prod_posting_group_code, requires_preauth, description, status, created_at, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, newCode, name, category, kind, dept, price, vat, flag(v.requires_preauth), desc, status, nowIso(), user.username);
  await audit(user, 'SERVICE_ITEM_CREATE', 'service_item', newCode, { price });
  return { code: newCode };
}

/* ------------------------------------------------------------------ price lists */

export const listPriceLists = (): Promise<PriceList[]> => all<PriceList>(
  `SELECT p.*, p.markup_pct::float AS markup_pct, (SELECT COUNT(*)::int FROM price_list_line l WHERE l.price_list_code = p.code) AS lines
   FROM price_list p ORDER BY CASE p.kind WHEN 'CASH' THEN 0 WHEN 'INSURANCE' THEN 1 ELSE 2 END, p.name`,
);

export async function savePriceList(code: string | null, v: Record<string, unknown>, user: Actor): Promise<{ code: string }> {
  const name = req(v.name, 'Name', 80);
  const kind = pick(v.kind, ['CASH', 'INSURANCE', 'CORPORATE', 'STAFF'] as const, 'Kind', 'CASH');
  const markup = num(v.markup_pct || 0, 'Markup %', -90, 500);
  const status = pick(v.status, ['ACTIVE', 'INACTIVE'] as const, 'Status', 'ACTIVE');
  if (code) {
    await run('UPDATE price_list SET name = ?, kind = ?, markup_pct = ?, status = ? WHERE code = ?', name, kind, markup, status, code);
    await audit(user, 'PRICE_LIST_UPDATE', 'price_list', code, { markup });
    return { code };
  }
  const newCode = req(v.code, 'Code', 20).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (await one('SELECT 1 FROM price_list WHERE code = ?', newCode)) throw new AppError('That code is in use', 'VALIDATION');
  await run('INSERT INTO price_list (code, name, kind, markup_pct, status, created_at, created_by) VALUES (?,?,?,?,?,?,?)', newCode, name, kind, markup, status, nowIso(), user.username);
  await audit(user, 'PRICE_LIST_CREATE', 'price_list', newCode);
  return { code: newCode };
}

/** Every active service with its price on `list` — the list's own line, else base price + markup. */
export async function priceListMatrix(list: string): Promise<{ id: number; code: string; name: string; kind: string; base_price: Cents; list_price: Cents | null; effective: Cents }[]> {
  return all(
    `SELECT s.id, s.code, s.name, s.kind, s.base_price, l.price AS list_price,
            COALESCE(l.price, ROUND(s.base_price * (1 + p.markup_pct / 100.0))::bigint) AS effective
     FROM service_item s CROSS JOIN price_list p LEFT JOIN price_list_line l ON l.price_list_code = p.code AND l.service_item_id = s.id
     WHERE p.code = @list AND s.status = 'ACTIVE' ORDER BY s.kind, s.name`, { list },
  );
}

export async function setPriceListLine(list: string, serviceItemId: number, raw: unknown, user: Actor): Promise<void> {
  if (!(await one('SELECT 1 FROM price_list WHERE code = ?', list))) throw new AppError('Price list not found', 'NOT_FOUND');
  if (String(raw ?? '').trim() === '') {
    await run('DELETE FROM price_list_line WHERE price_list_code = ? AND service_item_id = ?', list, serviceItemId);
  } else {
    const price = money(raw, 'Price');
    await run(`INSERT INTO price_list_line (price_list_code, service_item_id, price) VALUES (?,?,?)
               ON CONFLICT (price_list_code, service_item_id) DO UPDATE SET price = EXCLUDED.price`, list, serviceItemId, price);
  }
  await audit(user, 'PRICE_LIST_LINE_SET', 'price_list', list, { serviceItemId, price: raw });
}

/** The unit price of a service on a price list. */
export async function priceFor(serviceItemId: number, priceListCode: string): Promise<Cents> {
  const r = await one<{ price: Cents }>(
    `SELECT COALESCE(l.price, ROUND(s.base_price * (1 + COALESCE(p.markup_pct, 0) / 100.0))::bigint) AS price
     FROM service_item s LEFT JOIN price_list p ON p.code = @list
     LEFT JOIN price_list_line l ON l.price_list_code = @list AND l.service_item_id = s.id WHERE s.id = @id`,
    { id: serviceItemId, list: priceListCode },
  );
  if (!r) throw new AppError('Service not found', 'NOT_FOUND');
  return Number(r.price);
}

/* ------------------------------------------------------------------ payers */

export const listSchemes = (activeOnly = false): Promise<InsuranceScheme[]> => all<InsuranceScheme>(
  `SELECT s.*, c.no AS customer_no, COALESCE(c.balance, 0) AS customer_balance FROM insurance_scheme s LEFT JOIN customer c ON c.id = s.customer_id
   WHERE (@active = 0 OR s.status = 'ACTIVE') ORDER BY CASE s.payer_type WHEN 'SHA' THEN 0 ELSE 1 END, s.name`, { active: activeOnly ? 1 : 0 },
);

/** A new payer gets its own Receivables customer (claims are invoiced to it) and, unless one is named, the Cash tariff. */
export async function saveScheme(id: number | null, v: Record<string, unknown>, user: Actor): Promise<{ id: number }> {
  const name = req(v.name, 'Name', 120);
  const payerType = pick(v.payer_type, PAYER_TYPES, 'Payer type', 'INSURER');
  const copayType = pick(v.copay_type, COPAY_TYPES, 'Co-pay', 'NONE');
  const copay = copayType === 'PERCENT' ? Math.round(num(v.copay_value || 0, 'Co-pay %', 0, 100)) : copayType === 'FIXED' ? money(v.copay_value, 'Co-pay amount') : 0;
  const priceList = text(v.price_list_code, 'Price list', { max: 20 });
  if (priceList && !(await one('SELECT 1 FROM price_list WHERE code = ?', priceList))) throw new AppError('Unknown price list', 'VALIDATION');
  const vals = [
    name, payerType, priceList, copayType, copay, money(v.preauth_threshold, 'Pre-auth threshold'), money(v.visit_limit, 'Visit limit'),
    int(v.claim_submission_days || 30, 'Claim submission days', 1, 365), text(v.contact_name, 'Contact', { max: 80 }),
    email(v.contact_email, 'Contact e-mail'), text(v.contact_phone, 'Contact phone', { max: 40 }),
    pick(v.status, ['ACTIVE', 'INACTIVE'] as const, 'Status', 'ACTIVE'), text(v.notes, 'Notes', { max: 1000 }),
  ];
  if (id) {
    const r = await run(`UPDATE insurance_scheme SET name = ?, payer_type = ?, price_list_code = ?, copay_type = ?, copay_value = ?, preauth_threshold = ?,
                         visit_limit = ?, claim_submission_days = ?, contact_name = ?, contact_email = ?, contact_phone = ?, status = ?, notes = ? WHERE id = ?`, ...vals, id);
    if (!r.changes) throw new AppError('Payer not found', 'NOT_FOUND');
    await audit(user, 'SCHEME_UPDATE', 'insurance_scheme', id);
    return { id };
  }
  const code = req(v.code, 'Code', 20).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (await one('SELECT 1 FROM insurance_scheme WHERE code = ?', code)) throw new AppError('That code is in use', 'VALIDATION');
  return tx(async () => {
    const setup = await getClinicSetup();
    const { no } = await createCustomer({
      name, contact: vals[8] as string | null, email: vals[9] as string | null, phone: vals[10] as string | null,
      customerPostingGroupCode: setup.scheme_customer_posting_group, paymentTermsCode: '30 DAYS', creditLimit: 0, blocked: '',
      vatBusPostingGroupCode: 'EXEMPT', city: 'Nairobi', country: 'Kenya',
    }, user);
    const customer = (await one<{ id: number }>('SELECT id FROM customer WHERE no = ?', no))!;
    const info = await run(`INSERT INTO insurance_scheme (code, name, payer_type, price_list_code, copay_type, copay_value, preauth_threshold, visit_limit,
                              claim_submission_days, contact_name, contact_email, contact_phone, status, notes, customer_id, created_at, created_by)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, code, ...vals, customer.id, nowIso(), user.username);
    await audit(user, 'SCHEME_CREATE', 'insurance_scheme', info.lastInsertRowid, { code, customer: no });
    return { id: info.lastInsertRowid };
  });
}

/* ------------------------------------------------------------------ laboratory catalogue */

export const listLabTests = (activeOnly = false): Promise<LabTest[]> => all<LabTest>(
  `SELECT t.*, COALESCE(s.base_price, 0) AS price, (SELECT COUNT(*)::int FROM lab_test_parameter p WHERE p.lab_test_id = t.id) AS parameters
   FROM lab_test t LEFT JOIN service_item s ON s.id = t.service_item_id WHERE (@a = 0 OR t.status = 'ACTIVE') ORDER BY t.section, t.sort_order, t.name`,
  { a: activeOnly ? 1 : 0 },
);
export const getLabTest = (id: number): Promise<LabTest | undefined> => one<LabTest>('SELECT * FROM lab_test WHERE id = ?', id);
export const listLabParameters = (testId: number): Promise<LabTestParameter[]> => all<LabTestParameter>(
  `SELECT id, lab_test_id, sort_order, name, unit, result_type, options, ref_low::float AS ref_low, ref_high::float AS ref_high,
          ref_low_female::float AS ref_low_female, ref_high_female::float AS ref_high_female, critical_low::float AS critical_low,
          critical_high::float AS critical_high, ref_text
   FROM lab_test_parameter WHERE lab_test_id = ? ORDER BY sort_order, id`, testId,
);

/** A new test also gets its charge-master line (LAB kind) at the price given. */
export async function saveLabTest(id: number | null, v: Record<string, unknown>, user: Actor): Promise<{ id: number }> {
  const name = req(v.name, 'Name', 120);
  const section = pick(v.section, LAB_SECTIONS, 'Section');
  const specimen = pick(v.specimen_type, SPECIMEN_TYPES, 'Specimen', 'BLOOD');
  const tat = int(v.tat_minutes || 60, 'Turnaround (minutes)', 5, 60 * 24 * 14);
  const container = text(v.container, 'Container', { max: 60 });
  const method = text(v.method, 'Method', { max: 80 });
  const status = pick(v.status, ['ACTIVE', 'INACTIVE'] as const, 'Status', 'ACTIVE');
  return tx(async () => {
    if (id) {
      const t = await getLabTest(id);
      if (!t) throw new AppError('Test not found', 'NOT_FOUND');
      await run('UPDATE lab_test SET name = ?, section = ?, specimen_type = ?, tat_minutes = ?, container = ?, method = ?, status = ? WHERE id = ?',
        name, section, specimen, tat, container, method, status, id);
      if (t.service_item_id && String(v.price ?? '').trim() !== '') {
        await run('UPDATE service_item SET base_price = ?, name = ? WHERE id = ?', money(v.price, 'Price'), name, t.service_item_id);
      }
      await audit(user, 'LAB_TEST_UPDATE', 'lab_test', id);
      return { id };
    }
    const code = req(v.code, 'Code', 20).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (await one('SELECT 1 FROM lab_test WHERE code = ?', code)) throw new AppError('That code is in use', 'VALIDATION');
    const svcCode = `LAB-${code}`;
    if (await getServiceItem(svcCode)) throw new AppError(`Service ${svcCode} already exists`, 'VALIDATION');
    const svc = await run(`INSERT INTO service_item (code, name, category_code, kind, department_code, base_price, created_at, created_by)
                           VALUES (?,?, 'LAB', 'LAB', 'LAB', ?,?,?)`, svcCode, name, money(v.price, 'Price'), nowIso(), user.username);
    const info = await run('INSERT INTO lab_test (code, name, section, specimen_type, tat_minutes, container, method, status, service_item_id) VALUES (?,?,?,?,?,?,?,?,?)',
      code, name, section, specimen, tat, container, method, status, svc.lastInsertRowid);
    await audit(user, 'LAB_TEST_CREATE', 'lab_test', info.lastInsertRowid, { code });
    return { id: info.lastInsertRowid };
  });
}

const dec = (x: unknown, label: string): number | null => (String(x ?? '').trim() === '' ? null : num(x, label, -1e6, 1e9));

export async function saveLabParameter(testId: number, paramId: number | null, v: Record<string, unknown>, user: Actor): Promise<void> {
  if (!(await getLabTest(testId))) throw new AppError('Test not found', 'NOT_FOUND');
  const type = pick(v.result_type, ['NUMERIC', 'TEXT', 'OPTION'] as const, 'Result type', 'NUMERIC');
  const options = text(v.options, 'Options', { max: 300 });
  if (type === 'OPTION' && !options) throw new AppError('List the options, comma-separated, normal first', 'VALIDATION');
  const vals = [
    req(v.name, 'Parameter', 80), text(v.unit, 'Unit', { max: 20 }), type, options,
    dec(v.ref_low, 'Low'), dec(v.ref_high, 'High'), dec(v.ref_low_female, 'Low (female)'), dec(v.ref_high_female, 'High (female)'),
    dec(v.critical_low, 'Critical low'), dec(v.critical_high, 'Critical high'), text(v.ref_text, 'Reference text', { max: 120 }),
    int(v.sort_order || 0, 'Order', 0, 999),
  ];
  if (paramId) {
    await run(`UPDATE lab_test_parameter SET name = ?, unit = ?, result_type = ?, options = ?, ref_low = ?, ref_high = ?, ref_low_female = ?, ref_high_female = ?,
               critical_low = ?, critical_high = ?, ref_text = ?, sort_order = ? WHERE id = ? AND lab_test_id = ?`, ...vals, paramId, testId);
  } else {
    await run(`INSERT INTO lab_test_parameter (name, unit, result_type, options, ref_low, ref_high, ref_low_female, ref_high_female, critical_low, critical_high, ref_text, sort_order, lab_test_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, testId);
  }
  await audit(user, 'LAB_PARAMETER_SAVE', 'lab_test', testId, { name: vals[0] });
}

export async function deleteLabParameter(testId: number, paramId: number, user: Actor): Promise<void> {
  if (await one('SELECT 1 FROM lab_result WHERE parameter_id = ?', paramId)) throw new AppError('Results have been recorded against this parameter — rename it instead', 'VALIDATION');
  await run('DELETE FROM lab_test_parameter WHERE id = ? AND lab_test_id = ?', paramId, testId);
  await audit(user, 'LAB_PARAMETER_DELETE', 'lab_test', testId, { paramId });
}

/* ------------------------------------------------------------------ formulary */

export const listDrugs = (opts: { q?: string; activeOnly?: boolean } = {}): Promise<Drug[]> => all<Drug>(
  `SELECT d.*, i.no AS item_no, COALESCE(i.inventory, 0) AS stock, COALESCE(s.base_price, 0) AS price, i.unit_cost, i.reorder_point
   FROM drug d JOIN item i ON i.id = d.item_id LEFT JOIN service_item s ON s.id = d.service_item_id
   WHERE (@q = '' OR d.generic_name ILIKE '%' || @q || '%' OR d.brand_name ILIKE '%' || @q || '%' OR i.no ILIKE '%' || @q || '%')
     AND (@a = 0 OR d.status = 'ACTIVE') ORDER BY d.generic_name, d.strength LIMIT 1000`,
  { q: qText(opts.q), a: opts.activeOnly ? 1 : 0 },
);
const getDrug = (id: number): Promise<Drug | undefined> => one<Drug>(
  `SELECT d.*, i.no AS item_no, COALESCE(i.inventory, 0) AS stock, COALESCE(s.base_price, 0) AS price, i.unit_cost, i.reorder_point
   FROM drug d JOIN item i ON i.id = d.item_id LEFT JOIN service_item s ON s.id = d.service_item_id WHERE d.id = ?`, id,
);

/**
 * A new formulary entry creates its inventory item (DRUGS posting groups, FIFO, base unit as given)
 * and its charge-master line (DRUG kind, PHARMACY category) — stock is then received through
 * Payables or the item journal like any other item.
 */
export async function saveDrug(id: number | null, v: Record<string, unknown>, user: Actor): Promise<{ id: number }> {
  const generic = req(v.generic_name, 'Generic name', 120);
  const brand = text(v.brand_name, 'Brand', { max: 120 });
  const strength = text(v.strength, 'Strength', { max: 40 });
  const form = pick(v.dosage_form, DOSAGE_FORMS, 'Dosage form', 'TABLET');
  const route = pick(v.default_route, ROUTES, 'Route', 'PO');
  const freq = text(v.default_frequency, 'Frequency', { max: 10 });
  const label = [generic, strength, form.toLowerCase()].filter(Boolean).join(' ');
  return tx(async () => {
    if (id) {
      const d = await getDrug(id);
      if (!d) throw new AppError('Drug not found', 'NOT_FOUND');
      await run(`UPDATE drug SET generic_name = ?, brand_name = ?, strength = ?, dosage_form = ?, default_route = ?, default_frequency = ?, controlled = ?, status = ? WHERE id = ?`,
        generic, brand, strength, form, route, freq, flag(v.controlled), pick(v.status, ['ACTIVE', 'INACTIVE'] as const, 'Status', 'ACTIVE'), id);
      if (d.service_item_id && String(v.price ?? '').trim() !== '') await run('UPDATE service_item SET base_price = ?, name = ? WHERE id = ?', money(v.price, 'Price'), label, d.service_item_id);
      await run('UPDATE item SET description = ?, reorder_point = ? WHERE id = ?', label, int(v.reorder_point || 0, 'Reorder point', 0, 1e6), d.item_id);
      await audit(user, 'DRUG_UPDATE', 'drug', id);
      return { id };
    }
    const uomCode = text(v.unit, 'Unit', { max: 10 }) ?? (form === 'TABLET' ? 'TAB' : form === 'CAPSULE' ? 'CAP' : 'PCS');
    const uom = await one<{ id: number }>('SELECT id FROM unit_of_measure WHERE code = ?', uomCode.toUpperCase());
    if (!uom) throw new AppError(`Unit of measure ${uomCode} does not exist`, 'VALIDATION');
    const ipg = await one<{ id: number }>("SELECT id FROM inventory_posting_group WHERE code = 'DRUGS'");
    const ppg = await one<{ id: number }>("SELECT id FROM product_posting_group WHERE code = 'DRUGS'");
    if (!ipg || !ppg) throw new AppError('The DRUGS inventory and product posting groups are missing', 'VALIDATION');
    const price = money(v.price, 'Selling price');
    const { no } = await createItem({
      description: label, baseUnitOfMeasureId: uom.id, inventoryPostingGroupId: ipg.id, productPostingGroupId: ppg.id,
      costingMethod: 'FIFO', unitCost: money(v.unit_cost, 'Unit cost'), unitPrice: price, reorderingPolicy: 'Fixed Reorder Qty.',
      reorderPoint: int(v.reorder_point || 0, 'Reorder point', 0, 1e6), reorderQuantity: 0, maximumInventory: 0, status: 'ACTIVE',
      unitsOfMeasure: [{ unitOfMeasureId: uom.id, qtyPerUnitOfMeasure: 1 }],
    }, user);
    const item = (await one<{ id: number }>('SELECT id FROM item WHERE no = ?', no))!;
    const svc = await run(`INSERT INTO service_item (code, name, category_code, kind, department_code, base_price, item_id, created_at, created_by)
                           VALUES (?,?, 'PHARMACY', 'DRUG', 'PHARM', ?,?,?,?)`, `RX-${no}`, label, price, item.id, nowIso(), user.username);
    const info = await run(`INSERT INTO drug (item_id, service_item_id, generic_name, brand_name, strength, dosage_form, default_route, default_frequency, controlled)
                            VALUES (?,?,?,?,?,?,?,?,?)`, item.id, svc.lastInsertRowid, generic, brand, strength, form, route, freq, flag(v.controlled));
    await audit(user, 'DRUG_CREATE', 'drug', info.lastInsertRowid, { item: no });
    return { id: info.lastInsertRowid };
  });
}

/* ------------------------------------------------------------------ ICD-10 */

export const searchIcd = (term: string, limit = 25): Promise<{ code: string; title: string }[]> => all(
  `SELECT code, title FROM icd_code WHERE (@q = '' AND common = 1) OR (@q <> '' AND (code ILIKE @q || '%' OR title ILIKE '%' || @q || '%'))
   ORDER BY common DESC, code LIMIT ${Math.min(Math.max(limit, 1), 100)}`, { q: qText(term) },
);
export const listCommonIcd = (): Promise<{ code: string; title: string; chapter: string | null }[]> => all('SELECT code, title, chapter FROM icd_code ORDER BY code');

export async function addIcd(v: Record<string, unknown>, user: Actor): Promise<void> {
  const code = req(v.code, 'Code', 10).toUpperCase();
  if (!/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/.test(code)) throw new AppError('An ICD-10 code looks like J06.9', 'VALIDATION');
  await run('INSERT INTO icd_code (code, title, chapter, common) VALUES (?,?,?,?) ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, common = EXCLUDED.common',
    code, req(v.title, 'Title', 200), text(v.chapter, 'Chapter', { max: 80 }), flag(v.common));
  await audit(user, 'ICD_SAVE', 'icd_code', code);
}

/* ------------------------------------------------------------------ pickers */

export const listClinicians = (): Promise<{ id: number; full_name: string; role_name: string }[]> => all(
  `SELECT u.id, u.full_name, r.name AS role_name FROM app_user u JOIN role r ON r.id = u.role_id
   WHERE u.status = 'ACTIVE' AND r.name IN ('Medical Officer', 'Clinical Officer', 'Dentist', 'Medical Director', 'Nurse')
   ORDER BY r.name, u.full_name`,
);
