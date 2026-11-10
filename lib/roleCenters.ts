/*
 * Role Centre analytics.
 *
 * One aggregate per Role Centre, each a composition of the reused report helpers (lib/reports.ts,
 * lib/clinic/reports.ts, lib/receivablesReports.ts, lib/payablesReports.ts) plus a few focused
 * queries for the trend series. All money is integer cents.
 *
 * These functions do NOT check permissions — the Role Centre page renders each widget only when
 * the viewer's permission set grants the underlying right (currentCanAction / currentCanPage),
 * so a profile without permission shows locked cards.
 */
import { one, all } from './db.ts';
import { accountBalances, trialBalance } from './accounting.ts';
import { getIncomeStatement, getBalanceSheet } from './reports.ts';
import { addDays } from './dateFormula.ts';
import { today } from './format.ts';
import { addMonths } from './dateFormula.ts';
import type { Cents, IsoDate } from './types.ts';

/* ------------------------------------------------------------------- shared */

/** The last `n` calendar months as `YYYY-MM`, oldest first (includes the current month). */
export function recentMonths(n = 12): string[] {
  const base = `${today().slice(0, 8)}01`;
  return Array.from({ length: n }, (_, i) => addMonths(base, -(n - 1 - i)).slice(0, 7));
}

export interface MonthPoint { month: string; [k: string]: string | number }

/** Payroll and cost-of-sales lines for the operating ratios. */
const PAYROLL_CODES = ['6010', '6015', '6016', '6017'];
/** Cash in hand and at bank — petty cash, the cashier till, the cash office, the bank, M-Pesa and cards. */
export const CASH_CODES = ['1010', '1012', '1015', '1020', '1030', '1040'];
/** Drugs, consumables and reagents used — the clinic's direct cost of care. */
const CONSUMABLE_CODES = ['5010', '5020', '5030'];
const RECEIVABLES_CODE = '1220';
const PATIENT_RECEIVABLES_CODE = '1210';
const UNBILLED_CLAIMS_CODE = '1215';
const CLAIM_REJECTIONS_CODE = '6152';

/* ---------------------------------------------------------- Finance Manager */

export interface FinanceManagerRoleCenter {
  kpi: { surplus: Cents; income: Cents; expense: Cents; cash: Cents; receivables: Cents; unbilled: Cents; patientOwed: Cents };
  pl: { month: string; income: Cents; expense: Cents; surplus: Cents }[];
  incomeMix: { name: string; amount: Cents }[];
  expenseMix: { name: string; amount: Cents }[];
  balanceSheet: { assets: Cents; liabilities: Cents; equity: Cents; surplus: Cents; balanced: boolean };
  ratios: { label: string; value: number; threshold: number; higherIsWorse?: boolean }[];
  approvals: { type: string; count: number }[];
}

export async function getFinanceManagerRoleCenter(): Promise<FinanceManagerRoleCenter> {
  const yearStart = `${today().slice(0, 4)}-01-01`;
  const months = recentMonths(12);
  const [bal, is, bs, monthlyPl, approvals] = await Promise.all([
    accountBalances([...CASH_CODES, ...PAYROLL_CODES, ...CONSUMABLE_CODES, RECEIVABLES_CODE, PATIENT_RECEIVABLES_CODE, UNBILLED_CLAIMS_CODE, CLAIM_REJECTIONS_CODE]),
    getIncomeStatement({ from: yearStart, to: today() }),
    getBalanceSheet({ asOf: today() }),
    all<{ month: string; income: Cents; expense: Cents }>(
      `SELECT substr(j.value_date,1,7) AS month,
              COALESCE(SUM(CASE WHEN a.type='INCOME' THEN jl.credit_lcy - jl.debit_lcy ELSE 0 END),0) income,
              COALESCE(SUM(CASE WHEN a.type='EXPENSE' THEN jl.debit_lcy - jl.credit_lcy ELSE 0 END),0) expense
       FROM journal_line jl JOIN journal j ON j.id = jl.journal_id JOIN gl_account a ON a.id = jl.gl_account_id
       WHERE a.type IN ('INCOME','EXPENSE') AND j.value_date >= @from AND j.closing_entry = 0
       GROUP BY month`,
      { from: `${months[0]}-01` },
    ),
    all<{ document_type: string; n: number }>(
      "SELECT document_type, COUNT(*) n FROM workflow_task WHERE status='PENDING' GROUP BY document_type ORDER BY n DESC",
    ).catch(() => []),
  ]);

  const byMonth = new Map(monthlyPl.map((r) => [r.month, r]));
  const pl = months.map((m) => {
    const r = byMonth.get(m) ?? { income: 0, expense: 0 };
    return { month: m, income: r.income, expense: r.expense, surplus: r.income - r.expense };
  });
  const revenue = is.totalIncome;
  const payroll = PAYROLL_CODES.reduce((a, c) => a + (bal[c] ?? 0), 0);
  const consumables = CONSUMABLE_CODES.reduce((a, c) => a + (bal[c] ?? 0), 0);
  const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    kpi: {
      surplus: is.surplus,
      income: is.totalIncome,
      expense: is.totalExpense,
      cash: CASH_CODES.reduce((a, c) => a + (bal[c] ?? 0), 0),
      receivables: bal[RECEIVABLES_CODE] ?? 0,
      unbilled: bal[UNBILLED_CLAIMS_CODE] ?? 0,
      patientOwed: bal[PATIENT_RECEIVABLES_CODE] ?? 0,
    },
    pl,
    incomeMix: is.income.filter((r) => r.amount !== 0).slice(0, 6).map((r) => ({ name: r.name, amount: r.amount })),
    expenseMix: is.expense.filter((r) => r.amount !== 0).slice(0, 6).map((r) => ({ name: r.name, amount: r.amount })),
    balanceSheet: {
      assets: bs.totals.assets, liabilities: bs.totals.liabilities, equity: bs.totals.equity,
      surplus: bs.surplus, balanced: bs.balanced,
    },
    ratios: [
      { label: 'Net margin (YTD)', value: ratio(is.surplus, revenue), threshold: 15 },
      { label: 'Payroll cost % of revenue', value: ratio(payroll, revenue), threshold: 45, higherIsWorse: true },
      { label: 'Drugs & consumables % of revenue', value: ratio(consumables, revenue), threshold: 30, higherIsWorse: true },
      { label: 'Claim rejections % of revenue', value: ratio(bal[CLAIM_REJECTIONS_CODE] ?? 0, revenue), threshold: 5, higherIsWorse: true },
    ],
    approvals: approvals.map((r) => ({ type: humaniseDoc(r.document_type), count: Number(r.n) })),
  };
}

function humaniseDoc(t: string): string {
  return String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ----------------------------------------------------------------- Accountant */

export interface AccountantRoleCenter {
  kpi: { balanced: boolean; outOfBalanceBy: Cents; draftJournals: number; journalsThisMonth: number; agedArTotal: Cents; agedApTotal: Cents };
  journalsByMonth: { month: string; journals: number; amount: Cents }[];
  bySource: { name: string; amount: Cents; entries: number }[];
  bankRec: { name: string; glBalance: Cents; lastReconciled: IsoDate | null; status: string }[];
  tax: { vatInput: Cents; whtWithheld: Cents };
}

export async function getAccountantRoleCenter(): Promise<AccountantRoleCenter> {
  const months = recentMonths(12);
  const ym = today().slice(0, 7);
  const yearStart = `${today().slice(0, 4)}-01-01`;
  const [tb, drafts, thisMonth, jByMonth, bySource, banks, vat, wht] = await Promise.all([
    trialBalance(),
    one<{ n: number }>("SELECT COUNT(*) n FROM journal WHERE COALESCE(status,'POSTED') NOT IN ('POSTED','REVERSED')").catch(() => ({ n: 0 })),
    one<{ n: number }>('SELECT COUNT(*) n FROM journal WHERE substr(value_date,1,7) = @ym', { ym }),
    all<{ month: string; n: number; amt: Cents }>(
      `SELECT substr(value_date,1,7) AS month, COUNT(*) n, COALESCE(SUM(amount),0) amt
       FROM journal WHERE value_date >= @from AND closing_entry = 0 GROUP BY month`,
      { from: `${months[0]}-01` },
    ),
    all<{ source_module: string; amt: Cents; n: number }>(
      `SELECT COALESCE(source_module,'GL') AS source_module, COALESCE(SUM(amount),0) amt, COUNT(*) n
       FROM journal WHERE value_date >= @ys AND closing_entry = 0 GROUP BY source_module ORDER BY amt DESC`,
      { ys: yearStart },
    ),
    all<{ name: string; balance: Cents; last_reconciled: IsoDate | null }>(
      `SELECT ba.name, ba.balance,
              (SELECT MAX(br.statement_date) FROM bank_reconciliation br
               WHERE br.bank_account_id = ba.id AND br.status = 'POSTED') AS last_reconciled
       FROM bank_account ba WHERE ba.status='ACTIVE' ORDER BY ba.name`,
    ).catch(() => []),
    one<{ v: Cents }>(
      "SELECT COALESCE(SUM(amount),0) v FROM vat_entry WHERE tax_type='VAT' AND type='Purchase' AND posting_date >= @ys",
      { ys: yearStart },
    ).catch(() => ({ v: 0 })),
    one<{ v: Cents }>(
      "SELECT COALESCE(SUM(amount),0) v FROM vat_entry WHERE tax_type='WHT' AND posting_date >= @ys",
      { ys: yearStart },
    ).catch(() => ({ v: 0 })),
  ]);

  const totals = tb.reduce((a, r) => ({ d: a.d + r.debit_balance, c: a.c + r.credit_balance }), { d: 0, c: 0 });
  const arAp = await Promise.all([
    import('./receivablesReports.ts').then((m) => m.getAgedAccountsReceivable({ asOf: today() })).catch(() => null),
    import('./payablesReports.ts').then((m) => m.getAgedAccountsPayable({ asOf: today() })).catch(() => null),
  ]);
  const agedArTotal = sumAgedBalance(arAp[0]);
  const agedApTotal = sumAgedBalance(arAp[1]);

  const jMap = new Map(jByMonth.map((r) => [r.month, r]));
  const daysSince = (d: IsoDate | null): number =>
    d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 9999;

  return {
    kpi: {
      balanced: totals.d === totals.c,
      outOfBalanceBy: Math.abs(totals.d - totals.c),
      draftJournals: Number(drafts?.n ?? 0),
      journalsThisMonth: Number(thisMonth?.n ?? 0),
      agedArTotal,
      agedApTotal,
    },
    journalsByMonth: months.map((m) => {
      const r = jMap.get(m);
      return { month: m, journals: Number(r?.n ?? 0), amount: Number(r?.amt ?? 0) };
    }),
    bySource: bySource.slice(0, 7).map((r) => ({ name: humaniseDoc(r.source_module), amount: r.amt, entries: Number(r.n) })),
    bankRec: banks.map((b) => ({
      name: b.name, glBalance: b.balance, lastReconciled: b.last_reconciled,
      status: daysSince(b.last_reconciled) <= 35 ? 'Current' : daysSince(b.last_reconciled) >= 9999 ? 'Never' : 'Overdue',
    })),
    tax: { vatInput: Number(vat?.v ?? 0), whtWithheld: Number(wht?.v ?? 0) },
  };
}

function sumAgedBalance(report: unknown): Cents {
  const r = report as { totals?: { balance?: number }; rows?: { balance?: number }[] } | null;
  if (r?.totals && typeof r.totals.balance === 'number') return r.totals.balance;
  if (!Array.isArray(r?.rows)) return 0;
  return r.rows.reduce((a, x) => a + (Number(x.balance) || 0), 0);
}

/* -------------------------------------------------------------------- HR & Payroll */

export interface HrPayrollRoleCenter {
  kpi: {
    headcountActive: number; headcountNew: number; headcountPendingApproval: number;
    pendingApprovals: number; leaveApplicationsPending: number; payrollPeriodStatus: string | null;
    lastNetPay: Cents;
  };
  headcountByDepartment: { name: string; count: number }[];
  upcomingLeave: { employeeName: string; leaveType: string; startDate: IsoDate }[];
  probationEnding: { employeeName: string; endDate: IsoDate }[];
  contractsExpiring: { employeeName: string; endDate: IsoDate }[];
}

export async function getHrPayrollRoleCenter(): Promise<HrPayrollRoleCenter> {
  const t = today();
  const in30 = addMonths(t, 1);
  const [
    active, newCount, pendingApprovalCount, byDept, pendingApprovalsTotal, leaveApps, openPeriod,
    lastPeriodNetPay, probation, contracts, upcomingLeave,
  ] = await Promise.all([
    one<{ n: number }>("SELECT COUNT(*) n FROM employee WHERE status IN ('ACTIVE','ON_LEAVE')").catch(() => ({ n: 0 })),
    one<{ n: number }>("SELECT COUNT(*) n FROM employee WHERE status = 'NEW'").catch(() => ({ n: 0 })),
    one<{ n: number }>("SELECT COUNT(*) n FROM employee WHERE status = 'PENDING_APPROVAL'").catch(() => ({ n: 0 })),
    all<{ name: string; n: number }>(
      `SELECT COALESCE(gd2.name, 'Unassigned') AS name, COUNT(*) AS n FROM employee e
       LEFT JOIN global_dimension_2_value gd2 ON gd2.id = e.global_dimension_2_id
       WHERE e.status IN ('ACTIVE','ON_LEAVE') GROUP BY gd2.name ORDER BY n DESC LIMIT 8`,
    ).catch(() => []),
    one<{ n: number }>(
      `SELECT
         (SELECT COUNT(*) FROM employee WHERE status = 'PENDING_APPROVAL')
         + (SELECT COUNT(*) FROM employee_edit_request WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM employee_exit WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM employee_contract_change WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM hr_leave_application WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM hr_leave_adjustment WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM hr_leave_recall WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM hr_leave_plan WHERE status = 'Pending Approval')
         + (SELECT COUNT(*) FROM payroll_period WHERE status = 'PENDING_APPROVAL')
         AS n`,
    ).catch(() => ({ n: 0 })),
    one<{ n: number }>("SELECT COUNT(*) n FROM hr_leave_application WHERE status = 'Pending Approval'").catch(() => ({ n: 0 })),
    one<{ status: string }>("SELECT status FROM payroll_period WHERE status IN ('OPEN','PENDING_APPROVAL','APPROVED') ORDER BY start_date DESC LIMIT 1").catch(() => undefined),
    one<{ v: number }>(
      `SELECT COALESCE(SUM(l.amount_cents), 0) AS v FROM payroll_period_transaction l
       WHERE l.transaction_code = 'NPAY' AND l.payroll_period_id = (SELECT id FROM payroll_period ORDER BY start_date DESC LIMIT 1)`,
    ).catch(() => ({ v: 0 })),
    all<{ name: string; probation_end_date: string }>(
      `SELECT (first_name || ' ' || last_name) AS name, probation_end_date FROM employee
       WHERE status IN ('ACTIVE') AND probation_status = 'ON_PROBATION' AND probation_end_date IS NOT NULL AND probation_end_date <= @d
       ORDER BY probation_end_date LIMIT 8`,
      { d: in30 },
    ).catch(() => []),
    all<{ name: string; end_date: string }>(
      `SELECT (e.first_name || ' ' || e.last_name) AS name, c.end_date FROM employee_contract c
       JOIN employee e ON e.id = c.employee_id
       WHERE c.is_current = true AND c.end_date IS NOT NULL AND c.end_date <= @d AND e.status IN ('ACTIVE','ON_LEAVE')
       ORDER BY c.end_date LIMIT 8`,
      { d: in30 },
    ).catch(() => []),
    all<{ name: string; leave_type: string; start_date: string }>(
      `SELECT (e.first_name || ' ' || e.last_name) AS name, lt.name AS leave_type, a.start_date FROM hr_leave_application a
       JOIN employee e ON e.id = a.employee_id JOIN hr_leave_type lt ON lt.id = a.leave_type_id
       WHERE a.status = 'Approved' AND a.start_date >= @t AND a.start_date <= @d
       ORDER BY a.start_date LIMIT 8`,
      { t, d: in30 },
    ).catch(() => []),
  ]);

  return {
    kpi: {
      headcountActive: Number(active?.n ?? 0), headcountNew: Number(newCount?.n ?? 0),
      headcountPendingApproval: Number(pendingApprovalCount?.n ?? 0),
      pendingApprovals: Number(pendingApprovalsTotal?.n ?? 0),
      leaveApplicationsPending: Number(leaveApps?.n ?? 0),
      payrollPeriodStatus: openPeriod?.status ?? null,
      lastNetPay: Number(lastPeriodNetPay?.v ?? 0),
    },
    headcountByDepartment: byDept.map((d) => ({ name: d.name, count: Number(d.n) })),
    upcomingLeave: upcomingLeave.map((r) => ({ employeeName: r.name, leaveType: r.leave_type, startDate: r.start_date })),
    probationEnding: probation.map((r) => ({ employeeName: r.name, endDate: r.probation_end_date })),
    contractsExpiring: contracts.map((r) => ({ employeeName: r.name, endDate: r.end_date })),
  };
}
