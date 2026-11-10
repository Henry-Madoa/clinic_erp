import { listJobGrades, listContractTypes, listTerminationReasons, listClearanceSections } from '../hrSetup.ts';
import { listLeaveTypes, listLeaveCalendars, listHolidays, listAccrueMatrix } from '../leaveManagement.ts';
import { listPostingGroups, listPayeBands, listNssfTiers, listTransactionCodes } from '../payrollSetup.ts';
import { listPaymentTerms, listPaymentMethods, listCustomerPostingGroups } from '../receivablesSetup.ts';
import { listVendorPostingGroups } from '../payablesSetup.ts';
import { listImprestPurposes } from '../imprest.ts';
import { listVatBusinessPostingGroups, listVatProductPostingGroups, listVatPostingSetup } from '../vatSetup.ts';
import { listJobQueueEntries } from '../jobQueue.ts';
import { listDocumentNoSeries, listNoSeriesWithLines } from '../noSeries.ts';
import { listDimensionValues } from '../pool.ts';
import { listCurrencies, listExchangeRates } from '../cashMgmtSetup.ts';
import { listDenominations } from '../denominations.ts';
import { listCashierSetups } from '../cashierSetup.ts';
import { listProfiles } from '../profiles.ts';
import { listApprovalUserSetup, listWorkflows, listWorkflowUserGroups, listDocumentTypeOptions } from '../workflow.ts';
import { listRecentMpesaRequests } from '../mpesa.ts';
import { listEtimsInvoices } from '../etims.ts';
import { listCompanies } from '../companies.ts';
import { listOutbox } from '../outbox.ts';
import { listConfigPackages } from '../configPackages.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money, type AnyListExport, type ListExportDef } from '../listExport.ts';
import type { ActionKey } from '../permissions.ts';
import type { ExcelColumn } from '../excel.ts';
import type { OutboxStatus } from '../types.ts';

/*
 * The Admin Centre's setup tables. Each is loaded whole, so one column spec drives both the
 * dynamic filter (in memory, lib/listFilters.ts filterRows) and the workbook. An Admin Centre
 * screen is guarded by its page (lib/adminNav.ts), so the export names the same page.
 */
type Kind = 'text' | 'number' | 'date' | 'when' | 'money' | 'bool';
/** [row key, label, kind (text), filterable (true)] */
type Col = [key: string, label: string, kind?: Kind, filterable?: boolean];

const YES_NO = [{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }];

function fieldsOf(cols: Col[]): FilterFieldDef[] {
  return cols.filter(([, , , filterable = true]) => filterable).map(([key, label, kind = 'text']): FilterFieldDef => (
    kind === 'money' ? { key, label, type: 'number', cents: true }
      : kind === 'bool' ? { key, label, type: 'select', options: YES_NO }
        : kind === 'when' ? { key, label, type: 'date', datetime: true }
          : { key, label, type: kind }
  ));
}

function columnsOf<T>(cols: Col[], custom: Record<string, (row: T) => string | number | null> = {}): ExcelColumn<T>[] {
  return cols.map(([key, label, kind = 'text']) => ({
    header: label, key, width: kind === 'money' ? 14 : kind === 'bool' ? 9 : 18,
    value: (row: T) => {
      if (custom[key]) return custom[key](row);
      const v = (row as Record<string, unknown>)[key];
      if (v === null || v === undefined) return null;
      if (kind === 'money') return money(v as number);
      if (kind === 'bool') return v ? 'Yes' : 'No';
      if (kind === 'number') return Number(v);
      return String(v);
    },
  }));
}

function adminList<T extends object>(o: {
  page: string | string[]; action?: ActionKey; sheet: string; filename: string;
  load: (ctx: Parameters<ListExportDef<T>['rows']>[0]) => Promise<T[]>;
  cols: Col[]; custom?: Record<string, (row: T) => string | number | null>;
}): ListExportDef<T> {
  const fields = fieldsOf(o.cols);
  return defineExport<T>({
    action: o.action, page: o.page, sheet: o.sheet, filename: o.filename, fields,
    rows: async (ctx) => filterRows(await o.load(ctx), fields, ctx.filters),
    columns: columnsOf(o.cols, o.custom),
  });
}

/** lib/admin.ts is loaded on first use: it reaches lib/session.ts (Next's request runtime), which the
 *  registry itself must not need — the security suite imports the registry outside a server. */
const adminModule = () => import('../admin.ts');

const CODE: Col = ['code', 'Code'];
const NAME: Col = ['name', 'Name'];
const DESCRIPTION: Col = ['description', 'Description'];
const STATUS: Col = ['status', 'Status'];

export const ADMIN_EXPORTS = {
  'job-grades': adminList({
    page: 'ADMIN_HR_JOB_GRADES', sheet: 'Job Grades', filename: 'job-grades.xlsx', load: listJobGrades,
    cols: [CODE, NAME, ['notice_period_days', 'Notice (days)', 'number'], ['leave_allowance_amount', 'Leave allowance', 'money'],
      ['training_allowance_amount', 'Training allowance', 'money'], ['overtime_allowance_amount', 'Overtime allowance', 'money']],
  }),
  'contract-types': adminList({
    page: 'ADMIN_HR_CONTRACT_TYPES', sheet: 'Contract Types', filename: 'contract-types.xlsx', load: listContractTypes,
    cols: [CODE, NAME, ['default_notice_period_days', 'Default notice (days)', 'number']],
  }),
  'termination-reasons': adminList({
    page: 'ADMIN_HR_TERMINATION_REASONS', sheet: 'Termination Reasons', filename: 'termination-reasons.xlsx', load: listTerminationReasons,
    cols: [CODE, DESCRIPTION, ['pay_gratuity', 'Pays gratuity', 'bool']],
  }),
  'clearance-sections': adminList({
    page: 'ADMIN_HR_CLEARANCE_SECTIONS', sheet: 'Clearance Sections', filename: 'clearance-sections.xlsx', load: listClearanceSections,
    cols: [CODE, NAME, ['owner_email', 'Owner email'], ['sort_order', 'Sort', 'number']],
  }),
  'leave-types': adminList({
    page: 'ADMIN_HR_LEAVE_TYPES', sheet: 'Leave Types', filename: 'leave-types.xlsx', load: listLeaveTypes,
    cols: [CODE, NAME, ['standard_days', 'Standard days', 'number'], ['accrues', 'Accrues', 'bool'], ['is_annual', 'Annual', 'bool'],
      ['is_sick_leave', 'Sick', 'bool'], STATUS],
  }),
  'leave-calendars': adminList({
    page: 'ADMIN_HR_LEAVE_CALENDAR', sheet: 'Leave Calendars', filename: 'leave-calendars.xlsx', load: listLeaveCalendars,
    cols: [CODE, ['start_date', 'Start', 'date'], ['end_date', 'End', 'date'], ['is_current', 'Current', 'bool'], ['closed', 'Closed', 'bool']],
  }),
  holidays: adminList({
    page: 'ADMIN_HR_HOLIDAYS', sheet: 'Holidays', filename: 'holidays.xlsx', load: listHolidays,
    cols: [['date', 'Date', 'date'], ['reason', 'Reason'], ['recurring', 'Recurring', 'bool']],
  }),
  'accrue-matrix': adminList({
    page: 'ADMIN_HR_ACCRUE_MATRIX', sheet: 'Leave Accrual Matrix', filename: 'leave-accrual-matrix.xlsx', load: listAccrueMatrix,
    cols: [['leave_type_name', 'Leave type'], ['job_grade_name', 'Job grade'], ['days_to_accrue', 'Days / run', 'number'],
      ['leave_day_worth_cents', 'Day worth', 'money']],
  }),
  'payroll-posting-groups': adminList({
    page: 'ADMIN_PAYROLL_POSTING_GROUPS', sheet: 'Payroll Posting Groups', filename: 'payroll-posting-groups.xlsx', load: listPostingGroups,
    cols: [CODE, NAME],
  }),
  'paye-bands': adminList({
    page: 'ADMIN_PAYROLL_PAYE_BANDS', sheet: 'PAYE Bands', filename: 'paye-bands.xlsx', load: listPayeBands,
    cols: [['sort_order', 'Order', 'number'], ['upper_bound_cents', 'Band width', 'money'], ['rate_pct', 'Rate %', 'number']],
  }),
  'nssf-tiers': adminList({
    page: 'ADMIN_PAYROLL_NSSF_TIERS', sheet: 'NSSF Tiers', filename: 'nssf-tiers.xlsx', load: listNssfTiers,
    cols: [['tier_no', 'Tier', 'number'], ['lower_limit_cents', 'Lower', 'money'], ['upper_limit_cents', 'Upper', 'money'],
      ['employee_rate_pct', 'Employee %', 'number'], ['employer_rate_pct', 'Employer %', 'number']],
  }),
  'transaction-codes': adminList({
    page: 'ADMIN_PAYROLL_TRANSACTION_CODES', sheet: 'Transaction Codes', filename: 'payroll-transaction-codes.xlsx', load: listTransactionCodes,
    cols: [CODE, NAME, ['type', 'Type'], ['special_type', 'Special type'], ['taxable', 'Taxable', 'bool'], STATUS],
  }),
  'payment-terms': adminList({
    page: 'RECEIVABLES', sheet: 'Payment Terms', filename: 'payment-terms.xlsx', load: listPaymentTerms,
    cols: [CODE, DESCRIPTION, ['due_date_calculation', 'Due date calc.'], ['discount_date_calculation', 'Discount date calc.'],
      ['discount_pct', 'Discount %', 'number'], STATUS],
  }),
  'payment-methods': adminList({
    page: 'RECEIVABLES', sheet: 'Payment Methods', filename: 'payment-methods.xlsx', load: listPaymentMethods,
    cols: [CODE, DESCRIPTION, ['bal_account_type', 'Bal. account type'], ['bal_account_no', 'Bal. account no.'], STATUS],
  }),
  'customer-posting-groups': adminList({
    page: 'RECEIVABLES', sheet: 'Customer Posting Groups', filename: 'customer-posting-groups.xlsx', load: listCustomerPostingGroups,
    cols: [CODE, DESCRIPTION, ['receivables_account_code', 'Receivables'], ['service_charge_account_code', 'Service charge'],
      ['additional_fee_account_code', 'Additional fee'], ['customers_using', 'Customers', 'number']],
  }),
  'vendor-posting-groups': adminList({
    page: 'PAYABLES', sheet: 'Vendor Posting Groups', filename: 'vendor-posting-groups.xlsx', load: listVendorPostingGroups,
    cols: [CODE, DESCRIPTION, ['payables_account_code', 'Payables'], ['service_charge_account_code', 'Service charge'],
      ['invoice_rounding_account_code', 'Invoice rounding'], ['vendors_using', 'Vendors', 'number']],
  }),
  'imprest-purposes': adminList({
    page: 'ADMIN_POOL_IMPREST_PURPOSES', sheet: 'Imprest Purposes', filename: 'imprest-purposes.xlsx', load: listImprestPurposes,
    cols: [CODE, DESCRIPTION, STATUS],
  }),
  'vat-business-groups': adminList({
    page: 'ADMIN_POOL_VAT', sheet: 'VAT Business Groups', filename: 'vat-business-posting-groups.xlsx', load: listVatBusinessPostingGroups,
    cols: [CODE, DESCRIPTION],
  }),
  'vat-product-groups': adminList({
    page: 'ADMIN_POOL_VAT', sheet: 'VAT Product Groups', filename: 'vat-product-posting-groups.xlsx', load: () => listVatProductPostingGroups(),
    cols: [CODE, DESCRIPTION, ['tax_type', 'Type']],
  }),
  'vat-posting-setup': adminList({
    page: 'ADMIN_POOL_VAT', sheet: 'VAT Posting Setup', filename: 'vat-posting-setup.xlsx', load: listVatPostingSetup,
    cols: [['vat_bus_posting_group_code', 'Business'], ['vat_prod_posting_group_code', 'Product'], ['tax_type', 'Type'],
      ['vat_pct', 'Rate %', 'number'], ['vat_calculation_type', 'Calculation'], ['tax_account_code', 'Tax account']],
  }),
  'job-queue': adminList({
    page: 'ADMIN_JOB_QUEUE', sheet: 'Job Queue', filename: 'job-queue.xlsx', load: listJobQueueEntries,
    cols: [CODE, DESCRIPTION, ['job_type', 'Job'], ['run_every_minutes', 'Every (minutes)', 'number'], STATUS,
      ['next_run_at', 'Next run', 'when'], ['last_run_at', 'Last run', 'when'], ['last_run_status', 'Last result']],
  }),
  'document-no-series': adminList({
    page: 'ADMIN_NO_SERIES', sheet: 'Document No. Series', filename: 'document-no-series.xlsx', load: listDocumentNoSeries,
    cols: [['category', 'Category'], ['label', 'Document'], ['series_code', 'No. series'], ['last_no_used', 'Last no. used'],
      ['next_no', 'Next no.'], ['manual_nos', 'Manual', 'bool']],
  }),
  'no-series': adminList({
    page: 'ADMIN_NO_SERIES', sheet: 'No. Series', filename: 'no-series.xlsx', load: listNoSeriesWithLines,
    cols: [CODE, DESCRIPTION, ['next_no', 'Next no.'], ['used_by', 'Used by', 'number']],
  }),
  'dimension-values': adminList({
    page: 'ADMIN_POOL_DIMENSIONS', sheet: 'Dimension Values', filename: 'dimension-values.xlsx',
    load: ({ params }) => listDimensionValues(params.get('slot') === '2' ? 2 : 1),
    cols: [CODE, NAME, STATUS],
  }),
  'admin-currencies': adminList({
    page: 'ADMIN_POOL_CURRENCIES', sheet: 'Currencies', filename: 'currencies.xlsx', load: listCurrencies,
    cols: [CODE, DESCRIPTION, ['is_base', 'Base', 'bool'], ['latest_rate', 'Latest rate', 'number'], ['blocked', 'Blocked', 'bool']],
  }),
  'admin-exchange-rates': adminList({
    page: 'ADMIN_POOL_CURRENCIES', sheet: 'Exchange Rates', filename: 'exchange-rates.xlsx', load: () => listExchangeRates(),
    cols: [['currency_code', 'Currency'], ['starting_date', 'Starting date', 'date'], ['exchange_rate_amount', 'Units', 'number'],
      ['relational_exch_rate_amount', 'LCY', 'number']],
  }),
  denominations: adminList({
    page: 'ADMIN_POOL_DENOMINATIONS', sheet: 'Denominations', filename: 'denominations.xlsx', load: listDenominations,
    cols: [CODE, DESCRIPTION, ['value', 'Value', 'money'], ['active', 'Active', 'bool'], ['sort_order', 'Order', 'number']],
  }),
  'cashier-setups': adminList({
    page: 'ADMIN_CASHIER_SETUP', sheet: 'Cashier Setup', filename: 'cashier-setup.xlsx', load: listCashierSetups,
    cols: [['user_username', 'User'], ['setup_type', 'Type'], ['bank_account_code', 'Cash account'], ['bank_account_name', 'Account name'],
      ['min_capacity', 'Min capacity', 'money'], ['max_capacity', 'Max capacity', 'money'], ['approval_limit', 'Approval limit', 'money']],
  }),
  /** Staff accounts: no e-mail, phone or security secrets — who, which permission set, and state. */
  users: adminList({
    page: 'ADMIN_USERS', sheet: 'Users', filename: 'users.xlsx', load: async () => (await adminModule()).listUsers(),
    cols: [['username', 'Username'], ['full_name', 'Name'], ['role_name', 'Permission set'], STATUS,
      ['last_login_at', 'Last sign-in', 'when'], ['totp_enabled', 'Two-factor', 'bool'], ['must_change_password', 'Must change password', 'bool']],
  }),
  roles: adminList({
    page: 'ADMIN_ROLES', sheet: 'Permission Sets', filename: 'permission-sets.xlsx', load: async () => (await adminModule()).listRoles(),
    cols: [NAME, DESCRIPTION, ['lines', 'Lines', 'number', false], ['userCount', 'Assigned users', 'number'], ['is_system', 'System', 'bool'],
      ['require_two_factor', 'Requires two-factor', 'bool']],
    custom: { lines: (r) => r.lines.length },
  }),
  profiles: adminList({
    page: 'ADMIN_PROFILES', sheet: 'Role Centre Profiles', filename: 'role-centre-profiles.xlsx', load: listProfiles,
    cols: [CODE, NAME, ['role_centre', 'Role Centre'], ['is_system', 'System', 'bool']],
  }),
  'approval-user-setup': adminList({
    page: 'ADMIN_WORKFLOWS_SETUP', sheet: 'User Setup', filename: 'approval-user-setup.xlsx', load: listApprovalUserSetup,
    cols: [['username', 'Username'], ['full_name', 'User'], ['employee_no', 'Employee no.'], ['employee_name', 'Employee'],
      ['approver_name', 'Approver'], ['substitute_name', 'Substitute'], ['is_approval_administrator', 'Approval admin', 'bool'],
      ['can_reverse_journal', 'Can reverse journal', 'bool'], ['allow_posting_from', 'Posting from', 'date'], ['allow_posting_to', 'Posting to', 'date']],
  }),
  workflows: adminList({
    page: 'ADMIN_WORKFLOWS_DEFINITIONS', sheet: 'Workflows', filename: 'workflows.xlsx', load: listWorkflows,
    cols: [NAME, ['document_type', 'Document type'], ['steps', 'Steps', 'number', false], ['enabled', 'Enabled', 'bool']],
    custom: { steps: (w) => w.steps.length },
  }),
  'workflow-groups': adminList({
    page: 'ADMIN_WORKFLOWS_GROUPS', sheet: 'Approval User Groups', filename: 'approval-user-groups.xlsx', load: listWorkflowUserGroups,
    cols: [NAME, ['members', 'Members', 'number'], STATUS],
  }),
  'workflow-tables': adminList({
    page: 'ADMIN_WORKFLOWS_TABLES', sheet: 'Table Relations', filename: 'workflow-table-relations.xlsx', load: listDocumentTypeOptions,
    cols: [['label', 'Document type'], ['table', 'Table'], ['wired', 'Enforced', 'bool']],
  }),
  /** The paying phone prints masked, like a receipt. */
  'mpesa-requests': adminList({
    page: 'ADMIN_INTEGRATIONS_MPESA', action: 'INTEGRATIONS_MPESA_MANAGE',
    sheet: 'M-Pesa Prompts', filename: 'mpesa-prompts.xlsx', load: () => listRecentMpesaRequests(),
    cols: [['requested_at', 'Sent', 'when'], ['customer_name', 'Client'], ['document_no', 'Invoice'], ['phone', 'Phone', 'text', false],
      ['amount', 'Amount', 'money'], STATUS, ['mpesa_receipt', 'Receipt'], ['result_desc', 'Result'], ['requested_by', 'By']],
    custom: { phone: (r) => (r.phone ? `${r.phone.slice(0, 5)}•••${r.phone.slice(-3)}` : null) },
  }),
  'etims-invoices': adminList({
    page: 'ADMIN_INTEGRATIONS_ETIMS', action: 'INTEGRATIONS_ETIMS_MANAGE',
    sheet: 'eTIMS', filename: 'etims-invoices.xlsx', load: () => listEtimsInvoices('attention'),
    cols: [['created_at', 'Queued', 'when'], ['source_type', 'Source'], ['source_no', 'Sale'], ['invc_no', 'Invoice no.', 'number'],
      ['total', 'Total', 'money'], ['tax_total', 'VAT', 'money'], STATUS, ['attempts', 'Attempts', 'number'], ['last_error', 'Last error']],
  }),
  companies: adminList({
    page: 'ADMIN_COMPANIES', sheet: 'Companies', filename: 'companies.xlsx', load: listCompanies,
    cols: [CODE, ['display_name', 'Company'], ['is_default', 'Default', 'bool'], ['copied_from', 'Copied from'],
      ['created_at', 'Created', 'when'], ['created_by', 'Created by']],
  }),
  /** Recipients and message bodies stay in the application — they carry clients' and staff contact details. */
  outbox: adminList({
    page: 'ADMIN_OUTBOX', sheet: 'Message Outbox', filename: 'message-outbox.xlsx',
    load: ({ q, params }) => listOutbox((params.get('status') ?? 'FAILED') as OutboxStatus | 'ALL', q),
    cols: [['created_at', 'Queued', 'when'], ['channel', 'Channel'], ['subject', 'Subject'], ['reference_type', 'About'],
      ['reference_no', 'Reference'], STATUS, ['attempts', 'Attempts', 'number'], ['last_error', 'Last error'], ['sent_at', 'Sent', 'when']],
  }),
  'config-packages': adminList({
    page: 'ADMIN_DATA', sheet: 'Configuration Packages', filename: 'configuration-packages.xlsx', load: listConfigPackages,
    cols: [CODE, NAME, ['table_name', 'Table'], ['fields', 'Fields', 'number', false], ['key_field', 'Key field']],
    custom: { fields: (p) => p.fields.length },
  }),
} satisfies Record<string, AnyListExport>;

/** Each admin list's filter allow-list, for its screen's ListTools. */
export const ADMIN_FIELDS = Object.fromEntries(
  Object.entries(ADMIN_EXPORTS).map(([key, def]) => [key, def.fields]),
) as Record<keyof typeof ADMIN_EXPORTS, FilterFieldDef[]>;

