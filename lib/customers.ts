/*
 * Customer cards — Business Central Table 18. Modelled on lib/fixedAssets.ts / lib/items.ts.
 * `balance` is a maintained roll-up of open cust_ledger_entry.remaining_amount (see
 * lib/custLedger.ts's recomputeCustomerBalance).
 */
import { one, all, run, nextSequence, audit, hasAnyRow } from './db.ts';
import { assertContactDetails } from './validate.ts';
import { AppError } from './errors.ts';
import { today } from './format.ts';
import { buildFilterClause, type FilterCondition, type FilterFieldDef } from './listFilters.ts';
import { buildOrderClause, type SortState } from './listSort.ts';
import { getSalesReceivablesSetup } from './receivablesSetup.ts';
import type {
  Actor, Cents, Customer, CustomerBlocked, CustomerListRow, CustomerStatistics, CustLedgerEntryView,
} from './types.ts';

const BLOCKED_VALUES: CustomerBlocked[] = ['', 'Ship', 'Invoice', 'All'];

const SELECT_ROW = `
  SELECT c.*,
         g.description AS customer_posting_group_description,
         pt.description AS payment_terms_description,
         COALESCE((SELECT SUM(e.remaining_amount) FROM cust_ledger_entry e
                   WHERE e.customer_id = c.id AND e.open = 1 AND e.due_date IS NOT NULL AND e.due_date < @today), 0) AS balance_due,
         (c.credit_limit > 0 AND c.balance > c.credit_limit) AS credit_limit_exceeded
  FROM customer c
  LEFT JOIN customer_posting_group g ON g.code = c.customer_posting_group_code
  LEFT JOIN payment_terms pt ON pt.code = c.payment_terms_code`;

export const CUSTOMER_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text', column: 'c.no' },
  { key: 'name', label: 'Name', type: 'text', column: 'c.name' },
  { key: 'customer_posting_group_code', label: 'Posting Group', type: 'select', column: 'c.customer_posting_group_code' },
  { key: 'city', label: 'City', type: 'text', column: 'c.city' },
  {
    key: 'blocked', label: 'Blocked', type: 'select', column: 'c.blocked',
    options: [{ value: 'Ship', label: 'Ship' }, { value: 'Invoice', label: 'Invoice' }, { value: 'All', label: 'All' }],
  },
];

const SORT_COLUMNS: Record<string, string> = {
  no: 'c.no', name: 'c.name', city: 'c.city', balance: 'c.balance', balance_due: 'balance_due',
};

export interface ListCustomersOptions {
  search?: string; filters?: FilterCondition[]; sort?: SortState | null;
}

export const listCustomers = (
  { search = '', filters = [], sort = null }: ListCustomersOptions = {},
): Promise<CustomerListRow[]> => {
  const { clause, params } = buildFilterClause(CUSTOMER_FILTER_FIELDS, filters);
  const orderBy = buildOrderClause(SORT_COLUMNS, sort, 'c.no');
  return all<CustomerListRow>(
    `${SELECT_ROW}
     WHERE (c.no ILIKE @like OR c.name ILIKE @like OR c.city ILIKE @like OR c.phone ILIKE @like)
       ${clause}
     ${orderBy}`,
    { like: `%${String(search).trim()}%`, today: today(), ...params },
  );
};

export const getCustomer = (no: string): Promise<CustomerListRow | undefined> =>
  one<CustomerListRow>(`${SELECT_ROW} WHERE c.no = @no`, { no, today: today() });

export const getCustomerById = (id: number): Promise<Customer | undefined> =>
  one<Customer>('SELECT * FROM customer WHERE id = ?', id);

export const listActiveCustomers = (): Promise<Pick<Customer, 'id' | 'no' | 'name' | 'blocked' | 'customer_posting_group_code' | 'payment_terms_code'>[]> =>
  all("SELECT id, no, name, blocked, customer_posting_group_code, payment_terms_code FROM customer ORDER BY no");

export const hasAnyCustomers = (): Promise<boolean> => hasAnyRow('customer');

/* -------------------------------------------------------------------- create / edit */

export interface CustomerInput {
  name: string;
  name2?: string | null;
  address?: string | null;
  address2?: string | null;
  city?: string | null;
  postCode?: string | null;
  country?: string | null;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  customerPostingGroupCode?: string | null;
  paymentTermsCode?: string | null;
  paymentMethodCode?: string | null;
  reminderTermsCode?: string | null;
  finChargeTermsCode?: string | null;
  salesperson?: string | null;
  currencyCode?: string | null;
  creditLimit: Cents;
  blocked: CustomerBlocked;
  globalDimension1Id?: number | null;
  globalDimension2Id?: number | null;
  /** KRA PIN (the buyer PIN on eTIMS invoices) and VAT business group (STANDARD / EXPORT / EXEMPT).
   *  Left undefined on an update, the stored values are kept. */
  kraPin?: string | null;
  vatBusPostingGroupCode?: string | null;
}

async function assertCustomer(input: CustomerInput): Promise<void> {
  if (input.kraPin && !/^[AP][0-9]{9}[A-Z]$/.test(input.kraPin.trim().toUpperCase())) {
    throw new AppError('A KRA PIN is a letter, nine digits and a letter (e.g. P051234567X)', 'VALIDATION');
  }
  if (input.vatBusPostingGroupCode && !(await hasAnyRow('vat_business_posting_group', 'code = ?', input.vatBusPostingGroupCode))) {
    throw new AppError('Unknown VAT business posting group', 'VALIDATION');
  }
  assertContactDetails({ phone: input.phone, email: input.email });
  if (!input.name?.trim()) throw new AppError('A name is required', 'VALIDATION');
  if (!BLOCKED_VALUES.includes(input.blocked)) throw new AppError('Invalid Blocked value', 'VALIDATION');
  if (input.creditLimit < 0) throw new AppError('Credit limit cannot be negative', 'VALIDATION');
  if (input.customerPostingGroupCode && !(await hasAnyRow('customer_posting_group', 'code = ?', input.customerPostingGroupCode))) {
    throw new AppError('Unknown customer posting group', 'VALIDATION');
  }
  if (input.paymentTermsCode && !(await hasAnyRow('payment_terms', 'code = ?', input.paymentTermsCode))) {
    throw new AppError('Unknown payment terms', 'VALIDATION');
  }
}

const customerCols = `name, name_2, address, address_2, city, post_code, country, contact, phone, email,
  customer_posting_group_code, payment_terms_code, payment_method_code, reminder_terms_code, fin_charge_terms_code,
  salesperson, currency_code, credit_limit, blocked, global_dimension_1_id, global_dimension_2_id, kra_pin, vat_bus_posting_group_code`;

const customerValues = (i: CustomerInput): unknown[] => [
  i.name.trim(), i.name2?.trim() || null, i.address?.trim() || null, i.address2?.trim() || null, i.city?.trim() || null,
  i.postCode?.trim() || null, i.country?.trim() || null, i.contact?.trim() || null, i.phone?.trim() || null, i.email?.trim() || null,
  i.customerPostingGroupCode || null, i.paymentTermsCode || null, i.paymentMethodCode || null, i.reminderTermsCode || null,
  i.finChargeTermsCode || null, i.salesperson?.trim() || null, i.currencyCode || null, Math.round(i.creditLimit), i.blocked,
  i.globalDimension1Id || null, i.globalDimension2Id || null,
  i.kraPin?.trim().toUpperCase() || null, i.vatBusPostingGroupCode || null,
];

export async function createCustomer(input: CustomerInput, user: Actor): Promise<{ no: string }> {
  await assertCustomer(input);
  const setup = await getSalesReceivablesSetup();
  const filled: CustomerInput = {
    ...input,
    customerPostingGroupCode: input.customerPostingGroupCode || setup.default_customer_posting_group_code,
    paymentTermsCode: input.paymentTermsCode || setup.default_payment_terms_code,
    reminderTermsCode: input.reminderTermsCode || setup.default_reminder_terms_code,
    finChargeTermsCode: input.finChargeTermsCode || setup.default_fin_charge_terms_code,
  };
  const no = await nextSequence('CUSTOMER');
  const values = [no, ...customerValues(filled), new Date().toISOString(), user.username];
  await run(
    `INSERT INTO customer (no, ${customerCols}, created_at, created_by) VALUES (${values.map(() => '?').join(',')})`,
    ...values,
  );
  await audit(user, 'CUSTOMER_CREATE', 'customer', no, { name: input.name });
  return { no };
}

export async function updateCustomer(no: string, input: CustomerInput, user: Actor): Promise<void> {
  const before = await getCustomerById((await one<{ id: number }>('SELECT id FROM customer WHERE no = ?', no))?.id ?? 0);
  if (!before) throw new AppError('Customer not found', 'NOT_FOUND');
  await assertCustomer(input);
  const hasEntries = await hasAnyRow('cust_ledger_entry', 'customer_id = ?', before.id);
  if (hasEntries && input.customerPostingGroupCode && input.customerPostingGroupCode !== before.customer_posting_group_code) {
    throw new AppError('The Customer Posting Group cannot change once ledger entries have been posted', 'VALIDATION');
  }
  await run(
    `UPDATE customer SET name = ?, name_2 = ?, address = ?, address_2 = ?, city = ?, post_code = ?, country = ?,
       contact = ?, phone = ?, email = ?, customer_posting_group_code = ?, payment_terms_code = ?, payment_method_code = ?,
       reminder_terms_code = ?, fin_charge_terms_code = ?, salesperson = ?, currency_code = ?, credit_limit = ?, blocked = ?,
       global_dimension_1_id = ?, global_dimension_2_id = ?, kra_pin = ?, vat_bus_posting_group_code = ? WHERE id = ?`,
    ...customerValues({
      ...input,
      kraPin: input.kraPin === undefined ? before.kra_pin : input.kraPin,
      vatBusPostingGroupCode: input.vatBusPostingGroupCode === undefined ? before.vat_bus_posting_group_code : input.vatBusPostingGroupCode,
    }), before.id,
  );
  await audit(user, 'CUSTOMER_UPDATE', 'customer', no, {});
}

/* --------------------------------------------------------------------- statistics */

export async function customerStatistics(customerId: number): Promise<CustomerStatistics> {
  const c = await one<{ balance: Cents; credit_limit: Cents }>(
    'SELECT balance, credit_limit FROM customer WHERE id = ?', customerId,
  );
  const due = await one<{ total: Cents; n: number }>(
    `SELECT COALESCE(SUM(remaining_amount), 0) AS total, COUNT(*) AS n
     FROM cust_ledger_entry WHERE customer_id = ? AND open = 1 AND due_date IS NOT NULL AND due_date < ?`,
    customerId, today(),
  );
  const orders = await one<{ total: Cents }>(
    `SELECT COALESCE(SUM(sl.line_amount - (sl.qty_invoiced / NULLIF(sl.quantity,0) * sl.line_amount)), 0) AS total
     FROM sales_header sh JOIN sales_line sl ON sl.sales_header_id = sh.id
     WHERE sh.customer_id = ? AND sh.document_type = 'Order'`,
    customerId,
  );
  const count = await one<{ n: number }>('SELECT COUNT(*) AS n FROM cust_ledger_entry WHERE customer_id = ?', customerId);
  return {
    balance: c?.balance ?? 0,
    balance_due: due?.total ?? 0,
    outstanding_orders: Math.round(orders?.total ?? 0),
    overdue_entries: Number(due?.n ?? 0),
    ledger_entry_count: Number(count?.n ?? 0),
    credit_limit: c?.credit_limit ?? 0,
  };
}

export const CUSTOMER_LEDGER_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'posting_date', label: 'Date', type: 'date', column: 'e.posting_date' },
  { key: 'customer_no', label: 'Customer no.', type: 'text', column: 'c.no' },
  { key: 'document_type', label: 'Type', type: 'text', column: 'e.document_type' },
  { key: 'document_no', label: 'Document', type: 'text', column: 'e.document_no' },
  { key: 'due_date', label: 'Due', type: 'date', column: 'e.due_date' },
  { key: 'amount', label: 'Amount', type: 'number', column: 'e.amount', cents: true },
  { key: 'remaining_amount', label: 'Remaining', type: 'number', column: 'e.remaining_amount', cents: true },
  { key: 'open', label: 'Open', type: 'select', column: 'e.open', options: [{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }] },
];

export const getCustomerLedgerEntries = (
  { customerId, openOnly = false, filters = [] }: { customerId?: number; openOnly?: boolean; filters?: FilterCondition[] } = {},
): Promise<CustLedgerEntryView[]> => {
  const { clause, params } = buildFilterClause(CUSTOMER_LEDGER_FILTER_FIELDS, filters);
  return all<CustLedgerEntryView>(
  `SELECT e.*, c.no AS customer_no, c.name AS customer_name
   FROM cust_ledger_entry e JOIN customer c ON c.id = e.customer_id
   WHERE 1=1 ${customerId ? 'AND e.customer_id = @customerId' : ''} ${openOnly ? 'AND e.open = 1' : ''} ${clause}
   ORDER BY e.posting_date DESC, e.id DESC`,
    { customerId, ...params },
  );
};

export const hasAnyCustLedgerEntries = (): Promise<boolean> => hasAnyRow('cust_ledger_entry');

/** BC's "Check Cust. Blocked" — a hard block on `blocked`; a soft (returned) warning on the
 *  credit limit / overdue balance per Sales & Receivables Setup's Credit Warnings. */
export async function checkCustomerAllowed(
  customerId: number, kind: 'Ship' | 'Invoice',
): Promise<{ blocked: boolean; reason?: string; warning?: string }> {
  const c = await getCustomerById(customerId);
  if (!c) return { blocked: true, reason: 'Customer not found' };
  if (c.blocked === 'All' || c.blocked === kind) {
    return { blocked: true, reason: `Customer ${c.no} is blocked for ${c.blocked === 'All' ? 'all transactions' : kind}` };
  }
  const setup = await getSalesReceivablesSetup();
  if (setup.credit_warnings === 'No Warning') return { blocked: false };
  const stats = await customerStatistics(customerId);
  if ((setup.credit_warnings === 'Both' || setup.credit_warnings === 'Credit Limit')
    && c.credit_limit > 0 && stats.balance > c.credit_limit) {
    return { blocked: false, warning: `Customer ${c.no} is over its credit limit` };
  }
  if ((setup.credit_warnings === 'Both' || setup.credit_warnings === 'Overdue Balance') && stats.balance_due > 0) {
    return { blocked: false, warning: `Customer ${c.no} has an overdue balance` };
  }
  return { blocked: false };
}
