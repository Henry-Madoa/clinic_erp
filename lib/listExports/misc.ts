import { listBudgets } from '../glBudgets.ts';
import { listFinancialReports } from '../financialReports.ts';
import { getOpenPayrollPeriod, listPeriodTransactions } from '../payroll.ts';
import { listEmployees } from '../employees.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';

/* These lists load whole (or are the recent window the screen shows), so their dynamic filters
   run in memory (lib/listFilters.ts filterRows) against these allow-lists. */
export const BUDGET_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'total', label: 'Total', type: 'number', cents: true },
  { key: 'blocked', label: 'Blocked', type: 'select', options: [{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }] },
  { key: 'created_by', label: 'Created by', type: 'text' },
];
export const FINANCIAL_REPORT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'row_group', label: 'Row definition', type: 'text' },
  { key: 'column_group', label: 'Column layout', type: 'text' },
];
export const PAYROLL_RUN_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'employee_no', label: 'Employee no.', type: 'text' },
  { key: 'last_name', label: 'Last name', type: 'text' },
  { key: 'global_dimension_2_name', label: 'Dimension 2', type: 'text' },
  { key: 'net_pay', label: 'Net pay', type: 'number', cents: true },
];

interface PayrollRunRow {
  id: number; employee_no: string; first_name: string; last_name: string; global_dimension_2_name: string | null;
  /** This run's net pay; null until payroll has run for the employee. */
  net_pay: number | null;
}

/** The open period and every active employee with their net pay so far — the Payroll screen's list. */
export async function payrollRunRows(): Promise<{ period: Awaited<ReturnType<typeof getOpenPayrollPeriod>>; rows: PayrollRunRow[] }> {
  const [period, employees] = await Promise.all([getOpenPayrollPeriod(), listEmployees({ view: 'active' })]);
  const net = new Map<number, number>();
  if (period) {
    for (const l of await listPeriodTransactions(period.id)) {
      if (l.transaction_code === 'NPAY') net.set(l.employee_id, (net.get(l.employee_id) ?? 0) + Number(l.amount_cents));
    }
  }
  return {
    period,
    rows: employees.map((e) => ({
      id: e.id, employee_no: e.employee_no, first_name: e.first_name, last_name: e.last_name,
      global_dimension_2_name: e.global_dimension_2_name, net_pay: net.get(e.id) ?? null,
    })),
  };
}

export const MISC_EXPORTS = {

  budgets: defineExport({
    action: 'GL_BUDGETS_READ',
    sheet: 'Budgets', filename: 'budgets.xlsx',
    fields: BUDGET_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listBudgets(), BUDGET_FILTER_FIELDS, filters),
    columns: [
      { header: 'Name', key: 'name', value: (b) => b.name },
      { header: 'Description', key: 'description', width: 30, value: (b) => b.description },
      { header: 'From', key: 'first_date', width: 12, value: (b) => b.first_date },
      { header: 'To', key: 'last_date', width: 12, value: (b) => b.last_date },
      { header: 'Figures', key: 'entries', width: 10, value: (b) => Number(b.entries) },
      { header: 'Total', key: 'total', width: 14, value: (b) => money(b.total) },
      { header: 'Blocked', key: 'blocked', width: 9, value: (b) => (b.blocked ? 'Yes' : 'No') },
      { header: 'Created by', key: 'created_by', value: (b) => b.created_by },
    ],
  }),

  'financial-reports': defineExport({
    action: 'FINANCIAL_REPORTS_READ',
    sheet: 'Financial Reports', filename: 'financial-reports.xlsx',
    fields: FINANCIAL_REPORT_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listFinancialReports(), FINANCIAL_REPORT_FILTER_FIELDS, filters),
    columns: [
      { header: 'Name', key: 'name', value: (r) => r.name },
      { header: 'Description', key: 'description', width: 30, value: (r) => r.description },
      { header: 'Row definition', key: 'row_group', value: (r) => r.row_group },
      { header: 'Column layout', key: 'column_group', value: (r) => r.column_group },
    ],
  }),

  'payroll-run': defineExport({
    action: 'PAYROLL_READ',
    sheet: 'Payroll', filename: 'payroll-run.xlsx',
    fields: PAYROLL_RUN_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows((await payrollRunRows()).rows, PAYROLL_RUN_FILTER_FIELDS, filters),
    columns: [
      { header: 'Employee no.', key: 'employee_no', value: (e) => e.employee_no },
      { header: 'Name', key: 'name', width: 26, value: (e) => `${e.first_name} ${e.last_name}`.trim() },
      { header: 'Dimension 2', key: 'gd2', value: (e) => e.global_dimension_2_name },
      { header: 'Net pay (this run)', key: 'net_pay', width: 14, value: (e) => money(e.net_pay) },
    ],
  }),
};
