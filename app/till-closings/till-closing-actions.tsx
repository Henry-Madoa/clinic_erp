'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/ui/form-modal';
import { useEditableCard } from '@/components/ui/editable-card';
import { Field } from '@/components/ui/field';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useRunAction } from '@/components/ui/run-action';
import { useFormat } from '@/components/ui/format-provider';
import { today } from '@/lib/format';
import {
  requestTillClosing, saveTillClosing, deleteTillClosingRequest, refreshTillClosingRequest, submitTillClosingRequest, cancelTillClosingApprovalRequest,
  approveTillClosingRequest, rejectTillClosingRequest, reopenTillClosingRequest, postTillClosingRequest, previewTillDay,
} from '@/app/actions/tillClosings';
import type { TillClosingView } from '@/lib/types';

export type ClosableTill = { id: number; code: string; name: string; balance: number; own: boolean };
export type TreasuryAccount = { id: number; code: string; name: string };

/* ------------------------------------------------------------------ header */

function ClosingFields({ tills, treasuries, initial }: { tills: ClosableTill[]; treasuries: TreasuryAccount[]; initial?: TillClosingView | null }) {
  const { cur } = useFormat();
  const [tillId, setTillId] = useState(String(initial?.till_bank_account_id ?? (tills.length === 1 ? tills[0].id : tills.find((t) => t.own)?.id ?? '')));
  const [closingDate, setClosingDate] = useState(initial?.closing_date ?? today());
  const [returnToTreasury, setReturnToTreasury] = useState(initial ? initial.return_to_treasury : true);
  const [treasuryId, setTreasuryId] = useState(String(initial?.treasury_bank_account_id ?? (treasuries.length === 1 ? treasuries[0].id : '')));
  const [figures, setFigures] = useState<{ openingBalance: number; cashIn: number; cashOut: number; systemBalance: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!tillId || !closingDate) { setFigures(null); return; }
    previewTillDay(Number(tillId), closingDate).then((res) => { if (!cancelled) setFigures(res.ok ? res.data : null); });
    return () => { cancelled = true; };
  }, [tillId, closingDate]);
  return (
    <>
      <div className="grid g2">
        <SearchableSelect id="f_till" name="tillBankAccountId" label="Till" required items={tills} getValue={(t) => String(t.id)}
          getLabel={(t) => `${t.code} — ${t.name}${t.own ? ' (your till)' : ''}`} value={tillId} onChange={setTillId}
          placeholder="Search till…" emptyText="No tills you can close" />
        <Field name="closingDate" label="Closing date" type="date" required defaultValue={closingDate} max={today()} onChange={(e) => setClosingDate(e.target.value)}
          hint="The business day being closed" />
      </div>
      {figures ? (
        <div className="note">
          Opening {cur(figures.openingBalance)} + cash in {cur(figures.cashIn)} − cash out {cur(figures.cashOut)} = <b>{cur(figures.systemBalance)}</b> the ledger expects in the drawer.
        </div>
      ) : null}
      <Field name="returnToTreasury" label="Hand the counted cash to treasury at close" type="checkbox" defaultValue={returnToTreasury ? 1 : 0}
        onChange={(e) => setReturnToTreasury((e.target as HTMLInputElement).checked)} hint="Untick if this till keeps its float overnight" />
      {returnToTreasury ? (
        <SearchableSelect id="f_treasury" name="treasuryBankAccountId" label="Treasury vault" required items={treasuries} getValue={(t) => String(t.id)}
          getLabel={(t) => `${t.code} — ${t.name}`} value={treasuryId} onChange={setTreasuryId} placeholder="Search vault…" emptyText="No treasury vault set up" />
      ) : null}
      <Field name="varianceReason" label="Variance reason" type="textarea" defaultValue={initial?.variance_reason ?? ''}
        hint="Required only when the count differs from the system balance" />
    </>
  );
}

export function NewClosingButton({ tills, treasuries }: { tills: ClosableTill[]; treasuries: TreasuryAccount[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)} disabled={!tills.length} title={tills.length ? undefined : 'You have no till to close'}>Close a till</button>
      {open ? (
        <FormModal title="Close a till" wide onClose={() => setOpen(false)} onSubmit={requestTillClosing}
          submitLabel="Create" successTitle="Closing created" successDetail={(d) => `${d.no} — now count the cash in the drawer`} redirectTo={(d) => `/till-closings/view/${d.no}`}>
          <ClosingFields tills={tills} treasuries={treasuries} />
        </FormModal>
      ) : null}
    </>
  );
}

export function EditClosingForm({ closing, tills, treasuries }: { closing: TillClosingView; tills: ClosableTill[]; treasuries: TreasuryAccount[] }) {
  const { close } = useEditableCard();
  return (
    <FormModal inline title={`Edit ${closing.no}`} wide onClose={close} onSubmit={(v) => saveTillClosing(closing.no, v)}
      submitLabel="Save changes" successTitle="Closing updated">
      <ClosingFields tills={tills} treasuries={treasuries} initial={closing} />
    </FormModal>
  );
}

/* ------------------------------------------------------------------ document actions */

export function RefreshFiguresButton({ no, className = 'btn sm ghost' }: { no: string; className?: string }) {
  const { run, busy } = useRunAction();
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => refreshTillClosingRequest(no), 'Figures refreshed from the ledger')}>{busy ? 'Refreshing…' : 'Refresh figures'}</button>
  );
}

export function SubmitButton({ no, className = 'btn sm ghost' }: { no: string; className?: string }) {
  const { run, busy } = useRunAction();
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => submitTillClosingRequest(no), {
        confirm: { title: 'Send for approval?', message: 'The count and figures are frozen while pending.', confirmLabel: 'Send for approval' },
        successTitle: (d) => (d.autoApproved ? 'Approved — ready to post' : 'Sent for approval'),
      })}>{busy ? 'Working…' : 'Send for approval'}</button>
  );
}

export function CancelApprovalButton({ no, className = 'btn sm ghost' }: { no: string; className?: string }) {
  const { run, busy } = useRunAction();
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => cancelTillClosingApprovalRequest(no), {
        confirm: { title: 'Recall this closing?', message: 'It goes back to Open so you can recount and resubmit.', confirmLabel: 'Recall' },
        successTitle: 'Recalled — back to Open',
      })}>{busy ? 'Working…' : 'Cancel approval request'}</button>
  );
}

export { DelegateButton } from '@/components/ui/delegate-button';

export function ApproveButton({ no, className = 'btn sm' }: { no: string; className?: string }) {
  const { run, busy } = useRunAction();
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => approveTillClosingRequest(no), {
        confirm: { title: 'Approve this closing?', message: 'You are confirming the count and the variance reason. Nothing posts until it is posted.', confirmLabel: 'Approve' },
        successTitle: 'Approved — ready to post',
      })}>{busy ? 'Working…' : 'Approve'}</button>
  );
}

export function RejectButton({ no, className = 'btn sm ghost' }: { no: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Reject</button>
      {open ? (
        <FormModal title="Reject closing" onClose={() => setOpen(false)} onSubmit={(v) => rejectTillClosingRequest(no, String(v.reason || ''))}
          submitLabel="Reject" submitClass="btn danger" successTitle="Rejected — back to Open" resultStyle="popup">
          <Field name="reason" label="Reason" type="textarea" required />
        </FormModal>
      ) : null}
    </>
  );
}

export function ReopenButton({ no, className = 'btn sm ghost' }: { no: string; className?: string }) {
  const { run, busy } = useRunAction();
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => reopenTillClosingRequest(no), {
        confirm: { title: 'Reopen this closing?', message: 'It goes back to Open for a recount and must be approved again.', confirmLabel: 'Reopen' },
        successTitle: 'Reopened — back to Open',
      })}>{busy ? 'Working…' : 'Reopen'}</button>
  );
}

export function PostButton({ closing, className = 'btn sm' }: { closing: TillClosingView; className?: string }) {
  const { run, busy } = useRunAction();
  const { cur } = useFormat();
  const v = Number(closing.variance);
  const parts = [
    v < 0 ? `A shortage of ${cur(-v)} is charged to the Till shortages account.` : v > 0 ? `An overage of ${cur(v)} is credited to the Till overages account.` : 'The count agrees with the ledger.',
    closing.return_to_treasury ? `${cur(Number(closing.counted_amount))} is handed to ${closing.treasury_code ?? 'treasury'}.` : 'The cash stays in the till as its float.',
    `The till is then closed for ${closing.closing_date} — nothing more can post to it for that day.`,
  ];
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => postTillClosingRequest(closing.no), {
        confirm: { title: 'Post this closing?', message: parts.join(' '), confirmLabel: 'Post closing' },
        successTitle: 'Till closed',
        successDetail: (d) => [
          d.variance ? `variance ${cur(d.variance)} (${d.varianceJournalNo})` : 'no variance',
          d.returned ? `handed over ${cur(d.returned)} (${d.handoverJournalNo})` : 'float kept',
        ].join(' · '),
      })}>{busy ? 'Posting…' : 'Post closing'}</button>
  );
}

export function DeleteButton({ no, className = 'btn sm ghost' }: { no: string; className?: string }) {
  const { run, busy } = useRunAction();
  return (
    <button type="button" className={className} disabled={busy}
      onClick={() => run(() => deleteTillClosingRequest(no), {
        confirm: { title: 'Delete this closing?', message: 'It and its count are removed permanently. Only an open closing can be deleted.', confirmLabel: 'Delete' },
        successTitle: 'Deleted', redirectTo: '/till-closings',
      })}>{busy ? 'Working…' : 'Delete'}</button>
  );
}
