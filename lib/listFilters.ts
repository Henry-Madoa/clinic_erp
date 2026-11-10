/*
 * A generic "field + operator + value" filter builder for list pages — the same
 * shape as the Workflow condition editor (app/admin/workflow-form.tsx,
 * WorkflowConditionOperator/CONDITION_OPERATORS), generalized from "admin-defined
 * approval routing" to "any user narrowing a list before exporting it."
 *
 * Each list's lib module exports its own FilterFieldDef[] registry (the allow-list
 * of columns that may ever be filtered on) and passes it, together with the
 * FilterCondition[] parsed off the URL, into buildFilterClause() — a condition
 * naming any field outside that registry is silently dropped, so a hand-edited
 * URL can never reach an arbitrary column.
 */
import type { WorkflowConditionOperator } from './types.ts';

type FilterFieldType = 'text' | 'number' | 'date' | 'select';

export interface FilterFieldDef {
  key: string;
  label: string;
  type: FilterFieldType;
  /** The SQL column this condition applies to — defaults to `key`. */
  column?: string;
  /** True for a full timestamp column filtered by a date-only <input type=date> value —
   *  `=`/`!=`/`<=`/`BETWEEN`'s upper bound get an end-of-day boundary appended so a
   *  whole day still matches, instead of only ever matching exact midnight. */
  datetime?: boolean;
  /** A money column held in cents: the user types currency units (5000 = 5,000.00). */
  cents?: boolean;
  /** Static enum values; left undefined for a DB-driven lookup the page fills in at request time. */
  options?: { value: string | number; label: string }[];
}

export interface FilterCondition {
  field: string;
  operator: WorkflowConditionOperator;
  value: string;
  /** BETWEEN's upper bound. */
  value2?: string;
}

/** Select options for a fixed set of codes, labelled the way a status pill reads them. */
export const codeOptions = (...codes: string[]): { value: string; label: string }[] =>
  codes.map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ') }));

/** Parses the `filters` query param back into conditions — [] on anything malformed
 *  rather than throwing, since it's user-editable URL state. */
export function parseFilters(raw: string | null | undefined): FilterCondition[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is FilterCondition => (
      c && typeof c === 'object' && typeof c.field === 'string' && typeof c.operator === 'string'
      && typeof c.value === 'string'
    ));
  } catch {
    return [];
  }
}

const numberOf = (def: FilterFieldDef, v: string | undefined): number => (def.cents ? Math.round(Number(v) * 100) : Number(v));

const endOfDay = (date: string): string => `${date}T23:59:59.999`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A value the field's type can hold — a hand-edited URL's "abc" for a number or a date is
 *  dropped like an unknown field, rather than reaching the database as a type error. */
function usable(def: FilterFieldDef, v: string | undefined): boolean {
  if (v === undefined || v === '') return false;
  if (def.type === 'number') return Number.isFinite(Number(v));
  if (def.type === 'date') return ISO_DATE.test(v);
  return true;
}

/** Builds a parameterized "AND ..." clause plus its named params, ready to splice into an
 *  existing named-param query (lib/db.ts's `@name` style) alongside that query's own params. */
export function buildFilterClause(
  fields: FilterFieldDef[], conditions: FilterCondition[], paramPrefix = 'df',
): { clause: string; params: Record<string, unknown> } {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const parts: string[] = [];
  const params: Record<string, unknown> = {};

  conditions.forEach((c, i) => {
    const def = byKey.get(c.field);
    if (!def || !usable(def, c.value)) return;
    if (c.operator === 'BETWEEN' && !usable(def, c.value2)) return;
    // Text and select values compare as text, so a code or id column of any type takes any
    // value without a type error (a select's options are only ever ids or codes).
    const column = def.type === 'text' || def.type === 'select' ? `CAST(${def.column ?? def.key} AS text)` : def.column ?? def.key;
    const cast = (v: string): string | number => (def.type === 'number' ? numberOf(def, v) : v);
    const upper = (v: string): string | number => (def.datetime ? endOfDay(v) : cast(v));

    const p1 = `${paramPrefix}${i}a`;
    switch (c.operator) {
      case '=':
        if (def.datetime) {
          parts.push(`${column} >= @${p1} AND ${column} <= @${paramPrefix}${i}z`);
          params[p1] = c.value;
          params[`${paramPrefix}${i}z`] = upper(c.value);
        } else {
          parts.push(`${column} = @${p1}`);
          params[p1] = cast(c.value);
        }
        break;
      case '!=':
        parts.push(`${column} != @${p1}`);
        params[p1] = cast(c.value);
        break;
      case '>':
        parts.push(`${column} > @${p1}`);
        params[p1] = cast(c.value);
        break;
      case '>=':
        parts.push(`${column} >= @${p1}`);
        params[p1] = cast(c.value);
        break;
      case '<':
        parts.push(`${column} < @${p1}`);
        params[p1] = cast(c.value);
        break;
      case '<=':
        parts.push(`${column} <= @${p1}`);
        params[p1] = upper(c.value);
        break;
      case 'BETWEEN': {
        if (c.value2 === undefined || c.value2 === '') break;
        const p2 = `${paramPrefix}${i}b`;
        parts.push(`${column} BETWEEN @${p1} AND @${p2}`);
        params[p1] = cast(c.value);
        params[p2] = upper(c.value2);
        break;
      }
      default:
        break;
    }
  });

  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params };
}

/** One row value, normalised for comparison against a condition's (string) value. */
function comparable(raw: unknown, def: FilterFieldDef): string | number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  // A boolean column compares as the 1/0 a Yes/No select offers (Postgres flags are either).
  if (typeof raw === 'boolean') return def.type === 'number' ? Number(raw) : raw ? '1' : '0';
  if (def.type === 'number') return Number(raw);
  const text = raw instanceof Date ? raw.toISOString() : String(raw);
  return def.type === 'date' ? text.slice(0, 10) : text;
}

/**
 * The in-memory twin of buildFilterClause, for a list the server already loads whole (a setup
 * table, a short queue): the same allow-list, operators and NULL semantics, applied to each
 * row's `key` property on the server. Nothing from the request ever reaches SQL here.
 */
export function filterRows<T extends object>(rows: T[], fields: FilterFieldDef[], conditions: FilterCondition[]): T[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const active = conditions
    .map((c) => ({ c, def: byKey.get(c.field) }))
    .filter((x): x is { c: FilterCondition; def: FilterFieldDef } => (
      !!x.def && usable(x.def, x.c.value) && (x.c.operator !== 'BETWEEN' || usable(x.def, x.c.value2))
    ));
  if (!active.length) return rows;
  return rows.filter((row) => active.every(({ c, def }) => {
    const v = comparable((row as Record<string, unknown>)[def.key], def);
    if (v === null) return false;
    const a = def.type === 'number' ? numberOf(def, c.value) : c.value;
    switch (c.operator) {
      case '=': return v === a;
      case '!=': return v !== a;
      case '>': return v > a;
      case '>=': return v >= a;
      case '<': return v < a;
      case '<=': return v <= a;
      case 'BETWEEN': {
        const b = def.type === 'number' ? numberOf(def, c.value2) : c.value2!;
        return v >= a && v <= b;
      }
      default: return true;
    }
  }));
}
