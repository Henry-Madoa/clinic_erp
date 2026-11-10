'use client';

import { useState, type ReactNode } from 'react';
import { FormModal } from './form-modal';
import type { ActionResult, FormValues } from '@/lib/types';

/**
 * A table row edited in place: the row's cells, then an Edit button that opens the row's form
 * directly beneath it, inside the table — the Business Central line-editing feel, never a pop-up.
 * The server renders the cells and the pre-filled fields and binds the row's save action.
 */
export function EditableRow<T>({ cells, colSpan, action, canEdit, children, label = 'Edit', className, successTitle = 'Saved', extra }: {
  cells: ReactNode;
  /** Columns the form row spans — the table's column count. */
  colSpan: number;
  action: (v: FormValues) => Promise<ActionResult<T>>;
  canEdit: boolean;
  children: ReactNode;
  label?: string;
  className?: string;
  successTitle?: string;
  /** More buttons in the last cell (Delete, Accept…). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={className}>
        {cells}
        <td className="row-actions">
          {canEdit && !open ? <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>{label}</button> : null}
          {extra}
        </td>
      </tr>
      {open ? (
        <tr className="row-editor">
          <td colSpan={colSpan}>
            <FormModal<T> inline title="" onClose={() => setOpen(false)} onSubmit={action} successTitle={successTitle}>
              {children}
            </FormModal>
          </td>
        </tr>
      ) : null}
    </>
  );
}
