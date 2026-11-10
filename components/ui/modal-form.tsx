'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FormModal } from '@/components/ui/form-modal';
import { useRunAction } from '@/components/ui/run-action';
import type { ActionResult, FormValues } from '@/lib/types';

/**
 * The application's one create-modal form: a button that opens a FormModal whose fields are the
 * children, submitting to a Server Action the server component bound (`action.bind(null, no)`).
 * Server Actions authorise on their own — this is presentation only.
 */
export function ModalFormButton<T extends Record<string, unknown>>({
  label, title, action, children, className = 'btn', submitLabel = 'Save', successTitle,
  wide, redirectPrefix, redirectField, submitClass,
}: {
  label: ReactNode;
  title: string;
  action: (v: FormValues) => Promise<ActionResult<T>>;
  children: ReactNode;
  className?: string;
  submitLabel?: string;
  successTitle?: string;
  wide?: boolean;
  /** Land on `${redirectPrefix}${data[redirectField]}` after success — the record just created. */
  redirectPrefix?: string;
  redirectField?: keyof T & string;
  submitClass?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open ? (
        <FormModal<T>
          title={title} wide={wide} onClose={() => setOpen(false)} onSubmit={action}
          submitLabel={submitLabel} submitClass={submitClass} successTitle={successTitle} resultStyle="popup"
          redirectTo={redirectPrefix && redirectField ? (d) => `${redirectPrefix}${String(d[redirectField])}` : undefined}
        >
          {children}
        </FormModal>
      ) : null}
    </>
  );
}

/** A one-click Server Action with an optional "are you sure?" and the centred result pop-up. */
export function RunButton<T>({
  label, action, className = 'btn', successTitle, confirm, redirectTo,
}: {
  label: ReactNode;
  action: () => Promise<ActionResult<T>>;
  className?: string;
  successTitle: string;
  confirm?: { title: string; message: string; confirmLabel?: string; danger?: boolean };
  redirectTo?: string;
}) {
  const { run, busy } = useRunAction();
  return (
    <button
      type="button" className={className} disabled={busy}
      onClick={() => run(action, { successTitle, confirm, redirectTo })}
    >
      {busy ? 'Working…' : label}
    </button>
  );
}

/** Reveal a protected value on demand (an ID number) — each reveal is audited server-side. */
export function RevealButton({ masked, action }: { masked: string | null; action: () => Promise<ActionResult<{ value: string | null }>> }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (value !== null) return <span className="mono">{value || '—'}</span>;
  return (
    <span className="inline" style={{ gap: 6 }}>
      <span className="mono">{masked ?? '—'}</span>
      {masked ? (
        <button type="button" className="btn sm ghost" disabled={busy} title="Shows the full number — the view is written to the audit trail"
          onClick={async () => {
            setBusy(true);
            const r = await action();
            setBusy(false);
            if (r.ok) setValue(r.data.value ?? '');
            else setError(r.error);
          }}>
          {busy ? '…' : 'Reveal'}
        </button>
      ) : null}
      {error ? <span className="tiny danger-text">{error}</span> : null}
    </span>
  );
}

