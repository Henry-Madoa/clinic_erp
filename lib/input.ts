/*
 * Value checks for the operations modules (CRM, projects, timesheets, service desk, contracts,
 * company secretarial). A Server Action hands its FormValues straight through; every lib function
 * re-validates what it is given with these, so nothing typed in a browser reaches SQL unchecked.
 * Money arrives from <Field type="currency"> as a decimal string in shillings and is stored as
 * integer cents.
 */
import { AppError } from './errors.ts';
import type { Cents } from './types.ts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Trimmed text; null when blank (unless required). */
export function text(v: unknown, label: string, { required = false, max = 200 } = {}): string | null {
  const t = String(v ?? '').trim();
  if (!t) {
    if (required) throw new AppError(`${label} is required`, 'VALIDATION');
    return null;
  }
  if (t.length > max) throw new AppError(`${label} is too long (max ${max} characters)`, 'VALIDATION');
  return t;
}

export const req = (v: unknown, label: string, max = 200): string => text(v, label, { required: true, max })!;

export function int(v: unknown, label: string, min = 0, max = 1_000_000): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(`${label} must be a whole number between ${min} and ${max}`, 'VALIDATION');
  return n;
}

/** A decimal (hours, quantities, percentages) rounded to two places. */
export function num(v: unknown, label: string, min = 0, max = 1e9): number {
  const raw = String(v ?? '').replace(/,/g, '').trim();
  const n = raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new AppError(`${label} must be a number between ${min} and ${max}`, 'VALIDATION');
  return Math.round(n * 100) / 100;
}

/** Shillings (as typed) to integer cents, never negative. */
export function money(v: unknown, label: string, { required = false, positive = false } = {}): Cents {
  const raw = String(v ?? '').replace(/,/g, '').trim();
  if (!raw) {
    if (required || positive) throw new AppError(`${label} is required`, 'VALIDATION');
    return 0;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1e11) throw new AppError(`${label} must be a non-negative amount`, 'VALIDATION');
  const c = Math.round(n * 100);
  if (positive && c <= 0) throw new AppError(`${label} must be more than zero`, 'VALIDATION');
  return c;
}

export function isoDate(v: unknown, label: string, required = true): string | null {
  const d = String(v ?? '').trim();
  if (!d) {
    if (required) throw new AppError(`${label} is required`, 'VALIDATION');
    return null;
  }
  if (!ISO_DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw new AppError(`${label} is not a valid date`, 'VALIDATION');
  return d;
}

/** One of an allowed list (case-insensitive), with an optional fallback when blank. */
export function pick<T extends string>(v: unknown, allowed: readonly T[], label: string, fallback?: T): T {
  const raw = String(v ?? '').trim();
  if (!raw && fallback !== undefined) return fallback;
  const hit = allowed.find((a) => a.toUpperCase() === raw.toUpperCase());
  if (!hit) throw new AppError(`Pick a valid ${label}`, 'VALIDATION');
  return hit;
}

/** A checkbox / yes-no select as 0 | 1. */
export const flag = (v: unknown): 0 | 1 => (['1', 'true', 'on', 'yes'].includes(String(v ?? '').toLowerCase()) ? 1 : 0);

/** A positive integer id, or null when blank. */
export function optId(v: unknown, label: string): number | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(`${label} is not valid`, 'VALIDATION');
  return n;
}

export function email(v: unknown, label = 'Email'): string | null {
  const t = text(v, label, { max: 160 });
  if (t && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(t)) throw new AppError(`${label} is not a valid address`, 'VALIDATION');
  return t;
}

export function kraPin(v: unknown, label = 'KRA PIN'): string | null {
  const t = text(v, label, { max: 11 })?.toUpperCase() ?? null;
  if (t && !/^[AP][0-9]{9}[A-Z]$/.test(t)) throw new AppError(`${label} must be a letter, nine digits and a letter (e.g. P051234567X)`, 'VALIDATION');
  return t;
}

/** The search box, bounded. */
export const q = (v: unknown): string => String(v ?? '').trim().slice(0, 60);

/*
 * The application clock. Only the demonstration seed moves it (setDemoClock) — so the visits it
 * drives through the real services land on the past days they describe, with every journal,
 * receipt and stock movement dated to match. Everywhere else it is the wall clock.
 */
const clock = globalThis as typeof globalThis & { __clinicDemoClock?: number | null };
export function setDemoClock(iso: string | null): void { clock.__clinicDemoClock = iso ? Date.parse(iso) : null; }
const now = (): Date => new Date(clock.__clinicDemoClock ?? Date.now());

export const nowIso = (): string => now().toISOString();
export const todayIso = (): string => now().toISOString().slice(0, 10);

/** The Monday of the ISO week containing `iso`. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
