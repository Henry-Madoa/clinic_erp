/*
 * Cash denomination master + per-document breakdown — AL "Denominations Setup" and
 * "Transaction Denomination" (Tab52204045), driven by Codeunit 52204019's
 * ValidateTransactionDenominations. One shared line table keyed by a document-kind
 * discriminator ('TRANSFER' for cash office transfers, 'TILL_CLOSING' for a cashier's count).
 *
 * `assertDenominationsBalance()` is a no-op unless organisation.validate_cash_denomination is
 * on — AL's General Ledger Setup "Validate Cash Denomination" flag, checked in
 * before a cash office transfer is sent for approval.
 */
import { one, all, run } from './db.ts';
import { AppError } from './errors.ts';
import { getOrg } from './org.ts';
import type { Actor, Cents, Denomination, DenominationDocumentKind, DenominationLine } from './types.ts';

export const listDenominations = (): Promise<Denomination[]> =>
  all<Denomination>('SELECT * FROM denomination ORDER BY sort_order, value DESC');

export const listActiveDenominations = (): Promise<Denomination[]> =>
  all<Denomination>('SELECT * FROM denomination WHERE active = true ORDER BY sort_order, value DESC');

/** Every active denomination joined to this document's captured quantities (0 where none
 *  captured yet) — the grid a card renders. */
export async function getDenominationLines(
  kind: DenominationDocumentKind, no: string,
): Promise<DenominationLine[]> {
  return all<DenominationLine>(
    `SELECT d.id AS denomination_id, d.code, d.description, d.value,
            COALESCE(cdl.quantity, 0) AS quantity,
            (COALESCE(cdl.quantity, 0) * d.value) AS total
     FROM denomination d
     LEFT JOIN cash_denomination_line cdl
       ON cdl.denomination_id = d.id AND cdl.document_kind = ? AND cdl.document_no = ?
     WHERE d.active = true
     ORDER BY d.sort_order, d.value DESC`,
    kind, no,
  );
}

/** Sum of a document's captured breakdown, in cents. */
export async function denominationTotal(kind: DenominationDocumentKind, no: string): Promise<Cents> {
  const row = await one<{ total: Cents }>(
    `SELECT COALESCE(SUM(cdl.quantity * d.value), 0) AS total
     FROM cash_denomination_line cdl JOIN denomination d ON d.id = cdl.denomination_id
     WHERE cdl.document_kind = ? AND cdl.document_no = ?`,
    kind, no,
  );
  return row?.total ?? 0;
}

/** Replaces the whole breakdown for a document — delete then re-insert only the non-zero rows,
 *  the same discipline AL's ValidateTransactionDenominations uses (DeleteAll then re-seed). */
export async function replaceDenominationLines(
  kind: DenominationDocumentKind, no: string,
  lines: { denominationId: number; quantity: number }[],
): Promise<void> {
  await run('DELETE FROM cash_denomination_line WHERE document_kind = ? AND document_no = ?', kind, no);
  for (const l of lines) {
    const qty = Math.max(0, Math.round(Number(l.quantity) || 0));
    if (!qty) continue;
    await run(
      'INSERT INTO cash_denomination_line (document_kind, document_no, denomination_id, quantity) VALUES (?,?,?,?)',
      kind, no, l.denominationId, qty,
    );
  }
}

export async function clearDenominationLines(kind: DenominationDocumentKind, no: string): Promise<void> {
  await run('DELETE FROM cash_denomination_line WHERE document_kind = ? AND document_no = ?', kind, no);
}

/** AL's "The Denominations breakdown is not equal to the Total Amount" guard — only enforced
 *  when the company flag is on, so a company that doesn't count notes at the float is unaffected. */
export async function assertDenominationsBalance(
  kind: DenominationDocumentKind, no: string, amount: Cents,
): Promise<void> {
  const org = await getOrg();
  if (!org?.validate_cash_denomination) return;
  const total = await denominationTotal(kind, no);
  if (total !== amount) {
    throw new AppError(
      `The denomination breakdown (${(total / 100).toFixed(2)}) does not equal the amount (${(amount / 100).toFixed(2)})`,
      'DENOMINATION_MISMATCH',
    );
  }
}

/* --------------------------------------------------------------- admin CRUD */

export async function createDenomination(
  input: { code: string; description: string; value: Cents; sortOrder?: number }, user: Actor,
): Promise<{ id: number }> {
  const code = input.code.trim().toUpperCase();
  const description = input.description.trim();
  if (!code || !description) throw new AppError('Code and description are required', 'VALIDATION');
  if (!(input.value > 0)) throw new AppError('Value must be greater than zero', 'VALIDATION');
  if (await one('SELECT 1 FROM denomination WHERE code = ?', code)) {
    throw new AppError('A denomination with this code already exists', 'DUPLICATE');
  }
  const info = await run(
    'INSERT INTO denomination (code, description, value, active, sort_order) VALUES (?,?,?,true,?)',
    code, description, Math.round(input.value), Math.round(input.sortOrder ?? 0),
  );
  return { id: Number(info.lastInsertRowid) };
}

export async function updateDenomination(
  id: number,
  input: { description: string; value: Cents; active: boolean; sortOrder?: number },
): Promise<void> {
  const before = await one<Denomination>('SELECT * FROM denomination WHERE id = ?', id);
  if (!before) throw new AppError('Denomination not found', 'NOT_FOUND');
  const description = input.description.trim();
  if (!description) throw new AppError('Description is required', 'VALIDATION');
  if (!(input.value > 0)) throw new AppError('Value must be greater than zero', 'VALIDATION');
  await run(
    'UPDATE denomination SET description = ?, value = ?, active = ?, sort_order = ? WHERE id = ?',
    description, Math.round(input.value), !!input.active, Math.round(input.sortOrder ?? before.sort_order), id,
  );
}
