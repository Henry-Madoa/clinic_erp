'use client';

import type { ReactNode } from 'react';
import { FormModal } from './form-modal';
import { useEditableCard } from './editable-card';
import type { ActionResult, FormValues } from '@/lib/types';

/**
 * The edit side of an EditableCard for a record whose fields are plain inputs: the server page
 * renders the fields (pre-filled with the record) as children and binds the record's save action;
 * this puts them in an inline form on the card itself — never a pop-up — with Save / Cancel
 * returning the card to reading. Server Actions authorise on their own; this is presentation only.
 */
export function InlineEditForm<T>({ action, children, submitLabel = 'Save', successTitle = 'Saved' }: {
  action: (v: FormValues) => Promise<ActionResult<T>>;
  children: ReactNode;
  submitLabel?: string;
  successTitle?: string;
}) {
  const { close } = useEditableCard();
  return (
    <FormModal<T> inline title="" onClose={close} onSubmit={action} submitLabel={submitLabel} successTitle={successTitle}>
      {children}
    </FormModal>
  );
}
