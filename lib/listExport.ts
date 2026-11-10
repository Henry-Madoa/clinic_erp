/*
 * "Export to Excel" for every list screen, through one route (app/api/export/list/[key]) and a
 * registry of definitions (lib/listExports/*). Each definition names the same guard its page
 * uses — an action (or any of several), and for a per-tab module the tab's page code — and
 * loads its rows through the very list function the page calls, with the page's search, view
 * and dynamic filters, so the workbook is exactly what is on screen.
 *
 * The finance exports that predate this (app/api/export/<name>) keep their own routes.
 */
import type { ActionKey } from './permissions.ts';
import type { ExcelColumn } from './excel.ts';
import type { FilterCondition, FilterFieldDef } from './listFilters.ts';
import type { SortState } from './listSort.ts';
import type { SessionUser } from './types.ts';

export interface ListExportContext {
  /** The page's search box (`q`). */
  q: string;
  /** The page's tab or view, when it has one (`view`). */
  view: string;
  filters: FilterCondition[];
  sort: SortState | null;
  /** Every other query param the page forwarded (a date, an outlet…). */
  params: URLSearchParams;
  user: SessionUser;
}

export interface ListExportDef<T> {
  /** The page's action guard; an array means "any of" (a page guarded by requireAnyAction).
   *  Left out only for an Admin Centre screen, which is guarded by its page alone. */
  action?: ActionKey | ActionKey[];
  /** Further actions the screen checks on top (a tab inside the module guarded by its own action). */
  alsoRequires?: ActionKey[];
  /** The tab's page code, for a module whose tabs are gated one by one (requireModuleTab); an
   *  array means "any of" (an Admin Centre screen shared by several pages, lib/adminNav.ts). */
  page?: string | string[] | ((ctx: Omit<ListExportContext, 'user'>) => string | undefined);
  sheet: string;
  filename: string;
  /** The list's filter allow-list — what the page's DynamicFilterBar offers. The security suite
   *  sends every field, with hostile values, through the export to prove each one binds. */
  fields: FilterFieldDef[];
  rows: (ctx: ListExportContext) => Promise<T[]>;
  columns: ExcelColumn<T>[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyListExport = ListExportDef<any>;

/** Identity, for type inference: `rows` and `columns` must agree on the row shape. */
export const defineExport = <T>(def: ListExportDef<T>): ListExportDef<T> => def;

/** Cents → currency units, the way every money column is written. */
export const money = (cents: number | string | null | undefined): number | null =>
  cents === null || cents === undefined ? null : Number(cents) / 100;
