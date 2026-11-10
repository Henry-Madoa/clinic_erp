import { getEmployeeForUser } from '../selfService.ts';
import { listEmployeeEditRequests, type EmployeeEditView } from '../employeeEdits.ts';
import { listLeaveApplications, listLeavePlans, type LeaveApplicationView2, type PlanView } from '../leaveManagement.ts';
import { listImprestRequests, listPettyCash, type ImprestListView, type PettyCashListView } from '../imprest.ts';
import { listRequisitions, type RequisitionListView } from '../requisitions.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money, type ListExportContext } from '../listExport.ts';

/*
 * Employee Self Service: every list is the signed-in employee's own documents, so the export
 * resolves "me" from the session (never from the request) and filters in memory against these
 * allow-lists (lib/listFilters.ts filterRows).
 */
const NO: FilterFieldDef = { key: 'no', label: 'No.', type: 'text' };
const STATUS: FilterFieldDef = { key: 'status', label: 'Status', type: 'text' };
export const SELF_EDIT_FILTER_FIELDS: FilterFieldDef[] = [NO, { key: 'created_at', label: 'Raised', type: 'date', datetime: true }, STATUS];
export const SELF_LEAVE_FILTER_FIELDS: FilterFieldDef[] = [
  NO, { key: 'leave_type_name', label: 'Leave type', type: 'text' }, { key: 'start_date', label: 'Start', type: 'date' },
  { key: 'end_date', label: 'End', type: 'date' }, STATUS,
];
export const SELF_PLAN_FILTER_FIELDS: FilterFieldDef[] = [NO, STATUS];
export const SELF_IMPREST_FILTER_FIELDS: FilterFieldDef[] = [
  NO, { key: 'purpose', label: 'Purpose', type: 'text' }, { key: 'request_amount', label: 'Amount', type: 'number', cents: true },
  { key: 'request_date', label: 'Date', type: 'date' }, STATUS,
];
export const SELF_PETTY_CASH_FILTER_FIELDS: FilterFieldDef[] = [
  NO, { key: 'payment_narration', label: 'Narration', type: 'text' }, { key: 'total_amount', label: 'Amount', type: 'number', cents: true },
  { key: 'request_date', label: 'Date', type: 'date' }, STATUS,
];
export const SELF_REQUISITION_FILTER_FIELDS: FilterFieldDef[] = [
  NO, { key: 'title', label: 'Title', type: 'text' }, { key: 'requisition_date', label: 'Date', type: 'date' },
  { key: 'total_amount', label: 'Amount', type: 'number', cents: true }, STATUS,
];

/** The view when it is one the screen offers; 'all' (or nothing) means no status bucket. */
const viewOf = <T extends string>(view: string, allowed: readonly string[]): T | undefined =>
  (allowed.includes(view) && view !== 'all' ? view as T : undefined);

/** Rows for the signed-in employee, or none when the login is not matched to an employee. */
const mine = async <T>(ctx: ListExportContext, load: (employeeId: number) => Promise<T[]>): Promise<T[]> => {
  const me = await getEmployeeForUser(ctx.user.id);
  return me ? load(me.id) : [];
};

export const SELF_SERVICE_EXPORTS = {
  'self-employee-edits': defineExport({
    action: 'SELF_SERVICE_VIEW', page: 'SELF_SERVICE_RECORD',
    sheet: 'My Edit Requests', filename: 'my-edit-requests.xlsx',
    fields: SELF_EDIT_FILTER_FIELDS,
    rows: async (ctx) => filterRows(await mine(ctx, (id) => listEmployeeEditRequests({
      employeeId: id, view: viewOf<EmployeeEditView>(ctx.view, ['open', 'pending', 'approved', 'processed']),
    })), SELF_EDIT_FILTER_FIELDS, ctx.filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Raised', key: 'created_at', value: (r) => r.created_at },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Decision', key: 'decision_reason', width: 30, value: (r) => r.decision_reason },
    ],
  }),

  'self-leave': defineExport({
    action: 'SELF_SERVICE_VIEW', page: 'SELF_SERVICE_LEAVE',
    sheet: 'My Leave', filename: 'my-leave-applications.xlsx',
    fields: SELF_LEAVE_FILTER_FIELDS,
    rows: async (ctx) => filterRows(await mine(ctx, (id) => listLeaveApplications({
      employeeId: id, view: viewOf<LeaveApplicationView2>(ctx.view, ['open', 'pending', 'approved', 'processed']),
    })), SELF_LEAVE_FILTER_FIELDS, ctx.filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Leave type', key: 'leave_type_name', value: (r) => r.leave_type_name },
      { header: 'Start', key: 'start_date', width: 12, value: (r) => r.start_date },
      { header: 'End', key: 'end_date', width: 12, value: (r) => r.end_date },
      { header: 'Days', key: 'days', width: 8, value: (r) => (r.nature === 'REIMBURSEMENT' ? r.days_to_reimburse : r.days_applied) },
      { header: 'Balance', key: 'balance', width: 8, value: (r) => r.balance },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  'self-leave-plans': defineExport({
    action: 'SELF_SERVICE_VIEW', page: 'SELF_SERVICE_LEAVE_PLANS',
    sheet: 'My Leave Plans', filename: 'my-leave-plans.xlsx',
    fields: SELF_PLAN_FILTER_FIELDS,
    rows: async (ctx) => filterRows(await mine(ctx, (id) => listLeavePlans(viewOf<PlanView>(ctx.view, ['open', 'pending', 'approved']), id)), SELF_PLAN_FILTER_FIELDS, ctx.filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Created', key: 'created_at', value: (r) => r.created_at },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  'self-imprest': defineExport({
    action: 'SELF_SERVICE_VIEW', page: 'SELF_SERVICE_IMPREST',
    sheet: 'My Imprests', filename: 'my-imprests.xlsx',
    fields: SELF_IMPREST_FILTER_FIELDS,
    rows: async (ctx) => filterRows(await mine(ctx, (id) => listImprestRequests({
      employeeId: id,
      view: viewOf<ImprestListView>(ctx.view, ['open', 'pending', 'approved', 'issued', 'overdue', 'surrender-pending', 'surrender-approved', 'closed']) ?? 'all',
    })), SELF_IMPREST_FILTER_FIELDS, ctx.filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Date', key: 'request_date', width: 12, value: (r) => r.request_date },
      { header: 'Purpose', key: 'purpose', width: 26, value: (r) => r.purpose },
      { header: 'Amount', key: 'request_amount', width: 14, value: (r) => money(r.request_amount) },
      { header: 'Request', key: 'status', value: (r) => r.status },
      { header: 'Issued', key: 'posted', width: 8, value: (r) => (r.posted ? 'Yes' : 'No') },
      { header: 'Surrender', key: 'surrender_status', value: (r) => r.surrender_status },
    ],
  }),

  'self-petty-cash': defineExport({
    action: 'SELF_SERVICE_VIEW', page: 'SELF_SERVICE_PETTY_CASH',
    sheet: 'My Petty Cash', filename: 'my-petty-cash.xlsx',
    fields: SELF_PETTY_CASH_FILTER_FIELDS,
    rows: async (ctx) => filterRows(await mine(ctx, (id) => listPettyCash(
      viewOf<PettyCashListView>(ctx.view, ['open', 'pending', 'approved', 'posted', 'paid']) ?? 'all', '', id,
    )), SELF_PETTY_CASH_FILTER_FIELDS, ctx.filters),
    columns: [
      { header: 'No.', key: 'no', value: (p) => p.no },
      { header: 'Date', key: 'request_date', width: 12, value: (p) => p.request_date },
      { header: 'Narration', key: 'payment_narration', width: 30, value: (p) => p.payment_narration },
      { header: 'Amount', key: 'total_amount', width: 14, value: (p) => money(p.total_amount) },
      { header: 'Status', key: 'status', value: (p) => p.status },
      { header: 'Paid', key: 'posted', width: 8, value: (p) => (p.posted ? 'Yes' : 'No') },
    ],
  }),

  'self-requisitions': defineExport({
    action: 'SELF_SERVICE_VIEW', page: 'SELF_SERVICE_REQUISITIONS',
    sheet: 'My Requisitions', filename: 'my-requisitions.xlsx',
    fields: SELF_REQUISITION_FILTER_FIELDS,
    rows: async (ctx) => filterRows(await mine(ctx, (id) => listRequisitions(
      ctx.params.get('type') === 'purchase' ? 'Purchase Requisition' : 'Store Requisition',
      viewOf<RequisitionListView>(ctx.view, ['open', 'pending', 'approved', 'issued', 'received', 'closed']) ?? 'all', '', id,
    )), SELF_REQUISITION_FILTER_FIELDS, ctx.filters),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Date', key: 'requisition_date', width: 12, value: (r) => r.requisition_date },
      { header: 'Title', key: 'title', width: 28, value: (r) => r.title },
      { header: 'Qty', key: 'total_quantity', width: 8, value: (r) => r.total_quantity },
      { header: 'Amount', key: 'total_amount', width: 14, value: (r) => money(r.total_amount) },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),
};
