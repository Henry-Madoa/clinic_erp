import type { ActionResult } from './types.ts';

/**
 * A business-rule failure that is safe to show the user verbatim.
 *
 * Server Actions must not throw across the network boundary — Next.js replaces
 * an uncaught error with a generic digest in production — so actions catch this
 * and return `{ ok: false, error }` instead.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/** Raised by the posting engine and the services that drive it. */
export class PostingError extends AppError {
  constructor(message: string, code = 'POSTING_ERROR') {
    super(message, code);
    this.name = 'PostingError';
  }
}

export class ForbiddenError extends AppError {
  constructor(permission: string) {
    super(`Your role does not carry the ${permission} permission`, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * The PostgreSQL SQLSTATE behind a raw-query failure, if there is one. Prisma wraps a driver
 * error as PrismaClientKnownRequestError P2010 with the SQLSTATE in meta.code — or, through the
 * driver adapter, in meta.driverAdapterError.cause.originalCode; the adapter's own
 * DriverAdapterError carries it in cause.code / cause.originalCode. Every shape is covered
 * without depending on any of the classes.
 */
function sqlState(err: unknown): string | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as { code?: unknown; originalCode?: unknown; meta?: { code?: unknown; driverAdapterError?: unknown }; cause?: unknown };
    for (const c of [o.meta?.code, o.originalCode, o.code]) {
      if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) && !/^P\d{4}$/.test(c)) return c;
    }
    queue.push(o.cause, o.meta?.driverAdapterError);
  }
  return null;
}

/** The constraint name quoted in a PostgreSQL message, e.g. `"member_identification_no_key"` —
 *  in the error's own message or, through the driver adapter, the original one. */
function constraintOf(err: unknown): string | null {
  const e = err as { message?: unknown; meta?: { driverAdapterError?: { cause?: { originalMessage?: unknown } } } };
  const text = `${String(e?.message ?? '')} ${String(e?.meta?.driverAdapterError?.cause?.originalMessage ?? '')}`;
  return /constraint "([^"]+)"/.exec(text)?.[1] ?? null;
}

/**
 * A database failure reworded for the person at the screen. Integrity errors are business
 * facts (that number is taken; that record is still referenced) and are returned as such;
 * anything else — a syntax slip, a lost connection, a timeout — is a system fault whose driver
 * text belongs in the server log, not on a user's screen.
 */
export function translateDbError(err: unknown): AppError | null {
  const state = sqlState(err);
  if (!state) return null;
  const constraint = constraintOf(err);
  const what = constraint ? ` (${constraint.replace(/_(key|pkey|idx|fkey|check)$/, '').replace(/_/g, ' ')})` : '';
  switch (state) {
    case '23505': return new AppError(`A record with that value already exists${what}`, 'DUPLICATE');
    case '23503': return new AppError(`This record is still referenced by other records and cannot be changed or removed${what}`, 'IN_USE');
    case '23514': return new AppError(`The value breaks a rule the database enforces${what}`, 'CHECK_FAILED');
    case '23502': return new AppError(`A required field is missing${what}`, 'REQUIRED');
    case '22P02': case '22003': case '22007': case '22008': return new AppError('A value is in the wrong format', 'BAD_VALUE');
    case '40001': case '40P01': return new AppError('The record was being changed by someone else at the same moment — please try again', 'CONCURRENT_UPDATE');
    case '55P03': return new AppError('The record is locked by another transaction — please try again in a moment', 'LOCKED');
    default: return null;
  }
}

/** Wrap a Server Action body so business failures come back as data. */
export async function actionResult<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, code: err.code };
    const translated = translateDbError(err);
    if (translated) {
      console.warn('[action] db integrity:', (err as Error)?.message);
      return { ok: false, error: translated.message, code: translated.code };
    }
    // Everything else is a fault, not a business outcome. The driver's text (SQL fragments,
    // table names, connection details) stays in the log under a reference the user can quote.
    const ref = Math.random().toString(36).slice(2, 10).toUpperCase();
    console.error(`[action] ${ref}`, err);
    // In development the person at the screen is the developer: show them the real message so
    // the fault is not a round trip through the terminal. Production keeps the reference only.
    const detail = process.env.NODE_ENV !== 'production' && err instanceof Error ? ` — ${err.message.split(String.fromCharCode(10))[0].slice(0, 300)}` : '';
    return {
      ok: false,
      error: `Something went wrong on the server (ref ${ref})${detail}. Please try again; if it keeps happening, report the reference.`,
      code: 'INTERNAL_ERROR',
    };
  }
}
