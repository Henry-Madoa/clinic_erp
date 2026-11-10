import { listEmployees, EMPLOYEE_FILTER_FIELDS, type EmployeeListView } from '../employees.ts';
import { listEmployeeEditRequests, EDIT_FILTER_FIELDS, type EmployeeEditView } from '../employeeEdits.ts';
import { listExits, EXIT_FILTER_FIELDS, type ExitView } from '../employeeExits.ts';
import { listContractChanges, CONTRACT_CHANGE_FILTER_FIELDS, type ContractChangeView } from '../employeeContractChanges.ts';
import {
  listLeaveApplications, listLeaveAdjustments, listLeavePlans, listLeaveRecalls, LEAVE_APPLICATION_FILTER_FIELDS,
  type AdjustmentView, type PlanView, type RecallView,
} from '../leaveManagement.ts';
import { listCompanyJobs, listVacantPositions, type JobView } from '../companyJobs.ts';
import { listPayrollPeriods } from '../payroll.ts';
import { listCashTransfers, CASH_MANAGEMENT_FILTER_FIELDS, type CashManagementView } from '../cashManagement.ts';
import { codeOptions, filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';
import { humanise } from '../format.ts';

/** `view` must be one of the screen's own tabs; anything else falls back to its default tab. */
const pick = <T extends string>(view: string, allowed: readonly T[], fallback: T): T =>
  (allowed.includes(view as T) ? view : fallback) as T;
const DOC_VIEWS = ['open', 'pending', 'approved'] as const;
const DOC_STATUS: FilterFieldDef = { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Pending Approval', 'Approved', 'Rejected', 'Processed'].map((s) => ({ value: s, label: s })) };
const employeeName = (r: { employee_first_name: string; employee_last_name: string }) => `${r.employee_first_name} ${r.employee_last_name}`.trim();

/* The HR lists below without a SQL filter are short document queues, filtered in memory
   (lib/listFilters.ts filterRows) against these allow-lists. */
export const LEAVE_ADJUSTMENT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text' },
  { key: 'leave_type_name', label: 'Leave type', type: 'text' },
  { key: 'type', label: 'Type', type: 'select', options: codeOptions('POSITIVE', 'NEGATIVE') },
  { key: 'days', label: 'Days', type: 'number' },
  DOC_STATUS,
  { key: 'created_by', label: 'Created by', type: 'text' },
];
export const LEAVE_PLAN_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text' },
  { key: 'employee_no', label: 'Employee no.', type: 'text' },
  { key: 'employee_last_name', label: 'Employee last name', type: 'text' },
  DOC_STATUS,
  { key: 'created_by', label: 'Created by', type: 'text' },
];
export const LEAVE_RECALL_FILTER_FIELDS: FilterFieldDef[] = [
  ...LEAVE_PLAN_FILTER_FIELDS,
  { key: 'application_no', label: 'Source application', type: 'text' },
  { key: 'days_to_recall', label: 'Days to recall', type: 'number' },
];
export const COMPANY_JOB_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'job_id', label: 'Job ID', type: 'text' },
  { key: 'name', label: 'Job title', type: 'text' },
  { key: 'reports_to_job_code', label: 'Reports to', type: 'text' },
  { key: 'job_grade_name', label: 'Grade', type: 'text' },
  { key: 'no_of_posts', label: 'Posts', type: 'number' },
  { key: 'vacant', label: 'Vacant', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Pending Approval', 'Approved', 'Retired'].map((s) => ({ value: s, label: s })) },
];
export const PAYROLL_PERIOD_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'period_name', label: 'Period', type: 'text' },
  { key: 'start_date', label: 'Start', type: 'date' },
  { key: 'end_date', label: 'End', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: codeOptions('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'CLOSED') },
];

const jobColumns = [
  { header: 'Job ID', key: 'job_id', value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.job_id },
  { header: 'Job title', key: 'name', width: 28, value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.name },
  { header: 'Reports to', key: 'reports_to', width: 24, value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.reports_to_job_name },
  { header: 'Grade', key: 'job_grade_name', value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.job_grade_name },
  { header: 'Dimension 1', key: 'gd1', value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.global_dimension_1_name },
  { header: 'Posts', key: 'no_of_posts', width: 8, value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.no_of_posts },
  { header: 'Holders', key: 'occupied', width: 8, value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.occupied },
  { header: 'Vacant', key: 'vacant', width: 8, value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.vacant },
  { header: 'Management', key: 'is_management', width: 10, value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => (j.is_management ? 'Yes' : 'No') },
  { header: 'Status', key: 'status', value: (j: Awaited<ReturnType<typeof listCompanyJobs>>[number]) => j.status },
];

export const HR_EXPORTS = {
  /** Identity, tax, bank and contact details stay in the application. */
  employees: defineExport({
    action: 'EMPLOYEES_READ',
    sheet: 'Employees', filename: 'employees.xlsx',
    fields: EMPLOYEE_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listEmployees({ view: pick<EmployeeListView>(view, ['new', 'pending', 'active', 'inactive', 'all'], 'new'), search: q, filters, sort }),
    columns: [
      { header: 'Employee no.', key: 'employee_no', value: (e) => e.employee_no },
      { header: 'First name', key: 'first_name', value: (e) => e.first_name },
      { header: 'Last name', key: 'last_name', value: (e) => e.last_name },
      { header: 'Gender', key: 'gender', width: 10, value: (e) => humanise(e.gender) },
      { header: 'Job title', key: 'job_title', width: 24, value: (e) => e.job_title },
      { header: 'Job grade', key: 'job_grade_name', value: (e) => e.job_grade_name },
      { header: 'Nature of employment', key: 'nature', value: (e) => humanise(e.nature_of_employment) },
      { header: 'Dimension 1', key: 'gd1', value: (e) => e.global_dimension_1_name },
      { header: 'Dimension 2', key: 'gd2', value: (e) => e.global_dimension_2_name },
      { header: 'Employment date', key: 'employment_date', width: 12, value: (e) => e.employment_date },
      { header: 'Status', key: 'status', value: (e) => humanise(e.status) },
    ],
  }),

  'employee-edits': defineExport({
    action: 'EMPLOYEE_EDITS_READ',
    sheet: 'Employee Edits', filename: 'employee-edits.xlsx',
    fields: EDIT_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listEmployeeEditRequests({ view: pick<EmployeeEditView>(view, ['open', 'pending', 'approved', 'processed'], 'open'), search: q, filters, sort }),
    columns: [
      { header: 'Request no.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: employeeName },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Created by', key: 'created_by', value: (r) => r.created_by },
      { header: 'Created at', key: 'created_at', value: (r) => r.created_at },
    ],
  }),

  'employee-exits': defineExport({
    action: 'EMPLOYEE_EXITS_READ',
    sheet: 'Employee Exits', filename: 'employee-exits.xlsx',
    fields: EXIT_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listExits({ view: pick<ExitView>(view, DOC_VIEWS, 'open'), search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: employeeName },
      { header: 'Date of notice', key: 'date_of_notice', width: 12, value: (r) => r.date_of_notice },
      { header: 'Date of exit', key: 'date_of_exit', width: 12, value: (r) => r.date_of_exit },
      { header: 'Cleared', key: 'cleared', width: 8, value: (r) => (r.cleared ? 'Yes' : 'No') },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Created by', key: 'created_by', value: (r) => r.created_by },
    ],
  }),

  'employee-contract-changes': defineExport({
    action: 'EMPLOYEE_CONTRACT_CHANGES_READ',
    sheet: 'Contract Changes', filename: 'contract-changes.xlsx',
    fields: CONTRACT_CHANGE_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listContractChanges({ view: pick<ContractChangeView>(view, DOC_VIEWS, 'open'), search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: employeeName },
      { header: 'Nature', key: 'nature', value: (r) => humanise(r.nature) },
      { header: 'Proposed start', key: 'proposed_start_date', width: 12, value: (r) => r.proposed_start_date },
      { header: 'Proposed end', key: 'proposed_end_date', width: 12, value: (r) => r.proposed_end_date },
      { header: 'Proposed salary', key: 'proposed_salary', width: 14, value: (r) => money(r.proposed_salary_cents) },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Created by', key: 'created_by', value: (r) => r.created_by },
    ],
  }),

  'leave-applications': defineExport({
    action: 'LEAVE_APPLICATIONS_READ',
    sheet: 'Leave Applications', filename: 'leave-applications.xlsx',
    fields: LEAVE_APPLICATION_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listLeaveApplications({ view: pick(view, DOC_VIEWS, 'open'), search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: employeeName },
      { header: 'Leave type', key: 'leave_type_name', value: (r) => r.leave_type_name },
      { header: 'Nature', key: 'nature', value: (r) => humanise(r.nature) },
      { header: 'Start', key: 'start_date', width: 12, value: (r) => r.start_date },
      { header: 'End', key: 'end_date', width: 12, value: (r) => r.end_date },
      { header: 'Days', key: 'days', width: 8, value: (r) => (r.nature === 'REIMBURSEMENT' ? r.days_to_reimburse : r.days_applied) },
      { header: 'Balance', key: 'balance', width: 8, value: (r) => r.balance },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  'leave-adjustments': defineExport({
    action: 'LEAVE_ADJUSTMENTS_READ',
    sheet: 'Leave Adjustments', filename: 'leave-adjustments.xlsx',
    fields: LEAVE_ADJUSTMENT_FILTER_FIELDS,
    rows: async ({ view, filters }) => filterRows(await listLeaveAdjustments(pick<AdjustmentView>(view, DOC_VIEWS, 'open')), LEAVE_ADJUSTMENT_FILTER_FIELDS, filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Leave type', key: 'leave_type_name', value: (r) => r.leave_type_name },
      { header: 'Type', key: 'type', value: (r) => humanise(r.type) },
      { header: 'Days', key: 'days', width: 8, value: (r) => r.days },
      { header: 'Employees', key: 'line_count', width: 10, value: (r) => r.line_count },
      { header: 'Description', key: 'description', width: 30, value: (r) => r.description },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Created by', key: 'created_by', value: (r) => r.created_by },
    ],
  }),

  'leave-plans': defineExport({
    action: 'LEAVE_PLANS_READ',
    sheet: 'Leave Plans', filename: 'leave-plans.xlsx',
    fields: LEAVE_PLAN_FILTER_FIELDS,
    rows: async ({ view, filters }) => filterRows(await listLeavePlans(pick<PlanView>(view, DOC_VIEWS, 'open')), LEAVE_PLAN_FILTER_FIELDS, filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: employeeName },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Created by', key: 'created_by', value: (r) => r.created_by },
    ],
  }),

  'leave-recalls': defineExport({
    action: 'LEAVE_RECALLS_READ',
    sheet: 'Leave Recalls', filename: 'leave-recalls.xlsx',
    fields: LEAVE_RECALL_FILTER_FIELDS,
    rows: async ({ view, filters }) => filterRows(await listLeaveRecalls(pick<RecallView>(view, DOC_VIEWS, 'open')), LEAVE_RECALL_FILTER_FIELDS, filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: employeeName },
      { header: 'Source application', key: 'application_no', value: (r) => r.application_no },
      { header: 'Leave from', key: 'application_start_date', width: 12, value: (r) => r.application_start_date },
      { header: 'Leave to', key: 'application_end_date', width: 12, value: (r) => r.application_end_date },
      { header: 'Days to recall', key: 'days_to_recall', width: 10, value: (r) => r.days_to_recall },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  'company-jobs': defineExport({
    action: 'COMPANY_JOBS_READ',
    sheet: 'Company Jobs', filename: 'company-jobs.xlsx',
    fields: COMPANY_JOB_FILTER_FIELDS,
    rows: async ({ view, filters }) => filterRows(await listCompanyJobs(pick<JobView>(view, ['open', 'pending', 'approved', 'retired', 'all'], 'approved')), COMPANY_JOB_FILTER_FIELDS, filters),
    columns: jobColumns,
  }),

  'vacant-positions': defineExport({
    action: 'ORGANOGRAM_VIEW',
    sheet: 'Vacant Positions', filename: 'vacant-positions.xlsx',
    fields: COMPANY_JOB_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listVacantPositions(), COMPANY_JOB_FILTER_FIELDS, filters),
    columns: jobColumns,
  }),

  'payroll-periods': defineExport({
    action: 'PAYROLL_PERIODS_READ',
    sheet: 'Payroll Periods', filename: 'payroll-periods.xlsx',
    fields: PAYROLL_PERIOD_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listPayrollPeriods(), PAYROLL_PERIOD_FILTER_FIELDS, filters),
    columns: [
      { header: 'Period', key: 'period_name', width: 20, value: (p) => p.period_name },
      { header: 'Start', key: 'start_date', width: 12, value: (p) => p.start_date },
      { header: 'End', key: 'end_date', width: 12, value: (p) => p.end_date },
      { header: 'Status', key: 'status', value: (p) => humanise(p.status) },
      { header: 'Closed by', key: 'closed_by', value: (p) => p.closed_by },
      { header: 'Closed at', key: 'closed_at', value: (p) => p.closed_at },
    ],
  }),

  'branch-cash': defineExport({
    action: 'CASH_MANAGEMENT_READ',
    sheet: 'Branch Cash', filename: 'branch-cash.xlsx',
    fields: CASH_MANAGEMENT_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listCashTransfers({ view: pick<CashManagementView>(view, ['open', 'pending', 'approved', 'posted'], 'open'), search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (t) => t.no },
      { header: 'Movement', key: 'document_type', width: 22, value: (t) => t.document_type },
      { header: 'From', key: 'source_code', value: (t) => t.source_code },
      { header: 'From name', key: 'source_name', width: 22, value: (t) => t.source_name },
      { header: 'To', key: 'destination_code', value: (t) => t.destination_code },
      { header: 'To name', key: 'destination_name', width: 22, value: (t) => t.destination_name },
      { header: 'Amount', key: 'amount', width: 14, value: (t) => money(t.amount) },
      { header: 'Status', key: 'status', value: (t) => t.status },
      { header: 'Created by', key: 'created_by', value: (t) => t.created_by },
      { header: 'Posted at', key: 'posted_at', value: (t) => t.posted_at },
    ],
  }),
};
