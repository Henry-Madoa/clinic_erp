import {
  listImprestRequests, listPettyCash, listEmployeeBalances, listEmployeeLedger, IMPREST_FILTER_FIELDS,
  type ImprestListView, type PettyCashListView,
} from '../imprest.ts';
import { listStaffClaims, type StaffClaimListView } from '../staffClaims.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';

const DOC_STATUS: FilterFieldDef = {
  key: 'status', label: 'Status', type: 'select',
  options: ['Open', 'Pending Approval', 'Approved', 'Rejected', 'Released'].map((s) => ({ value: s, label: s })),
};

/* The Staff Cash Desk's petty cash, claims and ledger tabs load their lists whole, so their
   dynamic filters run in memory (lib/listFilters.ts filterRows) against these allow-lists. */
export const PETTY_CASH_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text' },
  { key: 'employee_no', label: 'Employee no.', type: 'text' },
  { key: 'payment_to', label: 'Paid to', type: 'text' },
  { key: 'total_amount', label: 'Amount', type: 'number', cents: true },
  { key: 'request_date', label: 'Date', type: 'date' },
  { key: 'paying_bank_code', label: 'Float', type: 'text' },
  DOC_STATUS,
];
export const STAFF_CLAIM_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text' },
  { key: 'employee_no', label: 'Employee no.', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'total_amount', label: 'Claimed', type: 'number', cents: true },
  { key: 'claim_date', label: 'Date', type: 'date' },
  DOC_STATUS,
];
export const EMPLOYEE_BALANCE_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'employee_no', label: 'Employee no.', type: 'text' },
  { key: 'last_name', label: 'Last name', type: 'text' },
  { key: 'balance', label: 'Balance', type: 'number', cents: true },
  { key: 'open_imprests', label: 'Open imprests', type: 'number' },
];
export const EMPLOYEE_LEDGER_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'posting_date', label: 'Date', type: 'date' },
  { key: 'employee_no', label: 'Employee no.', type: 'text' },
  { key: 'entry_type', label: 'Type', type: 'text' },
  { key: 'document_no', label: 'Document', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'number', cents: true },
];

const IMPREST_VIEWS: ImprestListView[] = ['open', 'pending', 'approved', 'issued', 'overdue', 'surrender-pending', 'surrender-approved', 'closed', 'all'];
const name = (r: { first_name: string; last_name: string }) => `${r.first_name} ${r.last_name}`.trim();

export const STAFF_CASH_EXPORTS = {
  'imprest-requests': defineExport({
    action: 'IMPREST_READ',
    sheet: 'Imprests', filename: 'imprests.xlsx',
    fields: IMPREST_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listImprestRequests({
      view: (IMPREST_VIEWS.includes(view as ImprestListView) ? view : 'open') as ImprestListView, search: q, filters, sort,
    }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: name },
      { header: 'Purpose', key: 'purpose', width: 24, value: (r) => r.purpose ?? r.purpose_code },
      { header: 'Requested', key: 'request_amount', width: 14, value: (r) => money(r.request_amount) },
      { header: 'Spent', key: 'surrender_amount', width: 14, value: (r) => money(r.surrender_amount) },
      { header: 'Net refund', key: 'net_refund', width: 14, value: (r) => money(r.net_refund) },
      { header: 'Date', key: 'request_date', width: 12, value: (r) => r.request_date },
      { header: 'Surrender due', key: 'due_date', width: 12, value: (r) => r.due_date },
      { header: 'Stage', key: 'stage', value: (r) => r.stage },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  'petty-cash': defineExport({
    action: 'IMPREST_READ',
    sheet: 'Petty Cash', filename: 'petty-cash.xlsx',
    fields: PETTY_CASH_FILTER_FIELDS,
    rows: async ({ view, q, filters }) => filterRows(
      await listPettyCash((['open', 'pending', 'approved', 'posted', 'paid', 'all'].includes(view) ? view : 'open') as PettyCashListView, q),
      PETTY_CASH_FILTER_FIELDS, filters,
    ),
    columns: [
      { header: 'No.', key: 'no', value: (p) => p.no },
      { header: 'Employee no.', key: 'employee_no', value: (p) => p.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: name },
      { header: 'Narration', key: 'payment_narration', width: 30, value: (p) => p.payment_narration },
      { header: 'Paid to', key: 'payment_to', width: 22, value: (p) => p.payment_to },
      { header: 'Amount', key: 'total_amount', width: 14, value: (p) => money(p.total_amount) },
      { header: 'Date', key: 'request_date', width: 12, value: (p) => p.request_date },
      { header: 'Float', key: 'paying_bank_code', value: (p) => p.paying_bank_code },
      { header: 'Status', key: 'status', value: (p) => p.status },
    ],
  }),

  'staff-claims': defineExport({
    action: 'IMPREST_READ',
    sheet: 'Staff Claims', filename: 'staff-claims.xlsx',
    fields: STAFF_CLAIM_FILTER_FIELDS,
    rows: async ({ view, q, filters }) => filterRows(
      await listStaffClaims((['open', 'pending', 'approved', 'stopped', 'posted', 'all'].includes(view) ? view : 'open') as StaffClaimListView, q),
      STAFF_CLAIM_FILTER_FIELDS, filters,
    ),
    columns: [
      { header: 'No.', key: 'no', value: (c) => c.no },
      { header: 'Employee no.', key: 'employee_no', value: (c) => c.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: name },
      { header: 'Description', key: 'description', width: 30, value: (c) => c.description },
      { header: 'Claimed', key: 'total_amount', width: 14, value: (c) => money(c.total_amount) },
      { header: 'Date', key: 'claim_date', width: 12, value: (c) => c.claim_date },
      { header: 'Paid', key: 'posted', width: 8, value: (c) => (c.posted ? 'Yes' : 'No') },
      { header: 'Status', key: 'status', value: (c) => c.status },
    ],
  }),

  'employee-balances': defineExport({
    action: 'IMPREST_READ',
    sheet: 'Employee Balances', filename: 'employee-balances.xlsx',
    fields: EMPLOYEE_BALANCE_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listEmployeeBalances(), EMPLOYEE_BALANCE_FILTER_FIELDS, filters),
    columns: [
      { header: 'Employee no.', key: 'employee_no', value: (b) => b.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: name },
      { header: 'Balance', key: 'balance', width: 14, value: (b) => money(b.balance) },
      { header: 'Open imprests', key: 'open_imprests', width: 12, value: (b) => b.open_imprests },
    ],
  }),

  'employee-ledger': defineExport({
    action: 'IMPREST_READ',
    sheet: 'Employee Ledger', filename: 'employee-ledger.xlsx',
    fields: EMPLOYEE_LEDGER_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listEmployeeLedger(undefined, 200), EMPLOYEE_LEDGER_FILTER_FIELDS, filters),
    columns: [
      { header: 'Date', key: 'posting_date', width: 12, value: (e) => e.posting_date },
      { header: 'Employee no.', key: 'employee_no', value: (e) => e.employee_no },
      { header: 'Employee', key: 'employee', width: 26, value: name },
      { header: 'Type', key: 'entry_type', value: (e) => e.entry_type.replace(/_/g, ' ') },
      { header: 'Document', key: 'document_no', value: (e) => e.document_no },
      { header: 'Description', key: 'description', width: 30, value: (e) => e.description },
      { header: 'Amount', key: 'amount', width: 14, value: (e) => money(e.amount) },
      { header: 'Journal', key: 'journal_no', value: (e) => e.journal_no },
    ],
  }),
};
