'use client';

import { useState } from 'react';
import { FormModal } from '@/components/ui/form-modal';
import { Field } from '@/components/ui/field';
import { saveDenomination } from '@/app/actions/denominations';
import type { Denomination } from '@/lib/types';

export function DenominationFormButton({ row, className = 'btn', children }: {
  row?: Denomination | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      {open ? (
        <FormModal
          title={row ? `Edit ${row.code}` : 'Add denomination'}
          onClose={() => setOpen(false)}
          onSubmit={(values) => saveDenomination(row ? row.id : null, values)}
          submitLabel="Save"
          successTitle="Denomination saved"
        >
          <div className="grid g2">
            {row ? null : <Field name="code" label="Code" required maxLength={20} uppercase placeholder="e.g. N1000" />}
            <Field name="value" label="Value" type="currency" min={0} required
              defaultValue={row ? row.value / 100 : ''} />
          </div>
          <Field name="description" label="Description" required defaultValue={row?.description ?? ''}
            placeholder="e.g. KSh 1,000 note" />
          <div className="grid g2">
            <Field name="sort_order" label="Sort order" type="number" min={0}
              defaultValue={row?.sort_order ?? 0} />
            {row ? (
              <Field name="active" label="Active" type="checkbox" defaultValue={row.active ? 1 : 0} />
            ) : null}
          </div>
        </FormModal>
      ) : null}
    </>
  );
}
