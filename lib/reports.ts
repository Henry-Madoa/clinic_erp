import { all } from './db.ts';
import { journalDateWindowSql } from './accounting.ts';
import { getTrialBalance, resolveDimensionFilterIds, TRIAL_BALANCE_FILTER_FIELDS } from './gl.ts';
import { buildFilterClause, type FilterCondition } from './listFilters.ts';
import type { BalanceSheet, Cents, IncomeStatement, IsoDate, ReportLine } from './types.ts';

/* The statutory statements — Statement of Financial Position and Statement of Comprehensive
 * Income — computed from journal lines, never from stored balances. */

export interface GetBalanceSheetOptions {
  /** One-line Date Filter range (see lib/format.ts's parseDateFilterExpression) — left unset,
   *  the usual cumulative Balance at Date; paired with `asOf`, a Net Change for that period,
   *  the same Date Filter FlowField behaviour as the Trial Balance this reuses. */
  from?: IsoDate | null;
  asOf?: IsoDate | null;
  /** Same filter bar as the Trial Balance: Code/Name/Type plus the Dimensional filter
   *  (Global Dimension combination/range expression) — see TRIAL_BALANCE_DIMENSION_FILTER_
   *  FIELDS in gl.ts. */
  filters?: FilterCondition[];
}

export async function getBalanceSheet(
  { from, asOf, filters = [] }: GetBalanceSheetOptions = {},
): Promise<BalanceSheet> {
  const { rows } = await getTrialBalance({ from, asOf, filters });
  const group = (t: string): ReportLine[] =>
    rows.filter((r) => r.type === t).map((r) => ({ code: r.code, name: r.name, amount: r.net }));
  const sum = (a: ReportLine[]): Cents => a.reduce((x, y) => x + y.amount, 0);

  const assets = group('ASSET');
  const liabilities = group('LIABILITY');
  const equity = group('EQUITY');
  const surplus = sum(group('INCOME')) - sum(group('EXPENSE'));

  const totals = {
    assets: sum(assets),
    liabilities: sum(liabilities),
    equity: sum(equity),
    equityAndLiabilities: sum(liabilities) + sum(equity) + surplus,
  };
  return { assets, liabilities, equity, surplus, totals, balanced: totals.assets === totals.equityAndLiabilities };
}

export interface GetIncomeStatementOptions {
  from?: string;
  to?: string;
  /** Same filter bar as the Trial Balance — see GetBalanceSheetOptions.filters. */
  filters?: FilterCondition[];
}

export async function getIncomeStatement(
  { from, to, filters = [] }: GetIncomeStatementOptions = {},
): Promise<IncomeStatement> {
  // A plain INNER JOIN, unlike the Trial Balance's own LEFT JOIN aggregate — an income/expense
  // account with nothing posted in the period is meant to be absent here (the report only ever
  // shows accounts with real activity; Section's own render already drops amount === 0 lines
  // regardless), so a dimension/account condition is safe straight in the WHERE clause.
  const { clause: whereClause, params: whereParams } = buildFilterClause(TRIAL_BALANCE_FILTER_FIELDS, filters, 'is');
  const gd1 = filters.find((f) => f.field === 'gd1_filter' && f.value !== '');
  const gd2 = filters.find((f) => f.field === 'gd2_filter' && f.value !== '');
  const [gd1Ids, gd2Ids] = await Promise.all([
    gd1 ? resolveDimensionFilterIds(1, gd1.value) : Promise.resolve(null),
    gd2 ? resolveDimensionFilterIds(2, gd2.value) : Promise.resolve(null),
  ]);
  const dimParams: Record<string, unknown> = {};
  const dimParts: string[] = [];
  if (gd1Ids !== null) { dimParts.push('AND jl.global_dimension_1_id = ANY(@gd1Ids)'); dimParams.gd1Ids = gd1Ids; }
  if (gd2Ids !== null) { dimParts.push('AND jl.global_dimension_2_id = ANY(@gd2Ids)'); dimParams.gd2Ids = gd2Ids; }

  const rows = await all<{ code: string; name: string; type: string; d: Cents; c: Cents }>(
    `SELECT a.code, a.name, a.type, COALESCE(SUM(jl.debit_lcy),0) d, COALESCE(SUM(jl.credit_lcy),0) c
     FROM gl_account a
     JOIN journal_line jl ON jl.gl_account_id = a.id
     JOIN journal j ON j.id = jl.journal_id
     WHERE a.type IN ('INCOME','EXPENSE')
       ${journalDateWindowSql('j', '@from', '@to')}
       ${whereClause}
       ${dimParts.join(' ')}
     GROUP BY a.id ORDER BY a.code`,
    { from: from || null, to: to || null, ...whereParams, ...dimParams },
  );
  const income = rows.filter((r) => r.type === 'INCOME')
    .map((r) => ({ code: r.code, name: r.name, amount: r.c - r.d }));
  const expense = rows.filter((r) => r.type === 'EXPENSE')
    .map((r) => ({ code: r.code, name: r.name, amount: r.d - r.c }));
  const s = (a: ReportLine[]): Cents => a.reduce((x, y) => x + y.amount, 0);
  return {
    income, expense,
    totalIncome: s(income), totalExpense: s(expense),
    surplus: s(income) - s(expense),
    from, to,
  };
}
