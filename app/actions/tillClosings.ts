'use server';

import { revalidatePath } from 'next/cache';
import { requireAction, requireUser } from '@/lib/session';
import { actionResult } from '@/lib/errors';
import {
  createTillClosing, updateTillClosing, deleteTillClosing, setTillCount, refreshTillClosing, submitTillClosing, cancelTillClosingApproval,
  approveTillClosing, rejectTillClosing, reopenTillClosing, postTillClosing, tillDayFigures,
  type TillClosingInput, type PostTillClosingResult,
} from '@/lib/tillClosings';
import { findPendingRoutedTask, decideWorkflowTask } from '@/lib/workflow';
import type { ActionResult, FormValues } from '@/lib/types';

const revalidate = (no?: string) => {
  for (const p of ['/till-closings', '/approvals', '/branch-cash', '/cash-management']) revalidatePath(p);
  if (no) revalidatePath(`/till-closings/view/${no}`);
};

const toInput = (values: FormValues): TillClosingInput => ({
  tillBankAccountId: Number(values.tillBankAccountId),
  closingDate: String(values.closingDate || ''),
  treasuryBankAccountId: values.treasuryBankAccountId ? Number(values.treasuryBankAccountId) : null,
  returnToTreasury: !!Number(values.returnToTreasury ?? 1),
  varianceReason: values.varianceReason ? String(values.varianceReason) : null,
});

export async function requestTillClosing(values: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    const res = await createTillClosing(toInput(values), user);
    revalidate();
    return res;
  });
}

export async function saveTillClosing(no: string, values: FormValues): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    await updateTillClosing(no, toInput(values), user);
    revalidate(no);
    return { updated: true };
  });
}

/** The denomination grid's save for a till closing — the count itself. */
export async function saveTillCount(no: string, lines: { denominationId: number; quantity: number }[]): Promise<ActionResult<{ updated: true; counted: number; variance: number }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    const r = await setTillCount(no, lines, user);
    revalidate(no);
    return { updated: true, ...r };
  });
}

export async function refreshTillClosingRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    await refreshTillClosing(no, user);
    revalidate(no);
    return { updated: true };
  });
}

export async function deleteTillClosingRequest(no: string): Promise<ActionResult<{ deleted: true }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    await deleteTillClosing(no, user);
    revalidate();
    return { deleted: true };
  });
}

export async function submitTillClosingRequest(no: string): Promise<ActionResult<{ updated: true; autoApproved: boolean }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    const { autoApproved } = await submitTillClosing(no, user);
    revalidate(no);
    return { updated: true, autoApproved };
  });
}

export async function cancelTillClosingApprovalRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_CREATE');
    await cancelTillClosingApproval(no, user);
    revalidate(no);
    return { updated: true };
  });
}

export async function approveTillClosingRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('TILL_CLOSING', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, true, null, user);
    } else {
      const user = await requireAction('TILL_CLOSINGS_APPROVE');
      await approveTillClosing(no, user);
    }
    revalidate(no);
    return { updated: true };
  });
}

export async function rejectTillClosingRequest(no: string, reason: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('TILL_CLOSING', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, false, reason || null, user);
    } else {
      const user = await requireAction('TILL_CLOSINGS_APPROVE');
      await rejectTillClosing(no, reason || null, user);
    }
    revalidate(no);
    return { updated: true };
  });
}

export async function reopenTillClosingRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_APPROVE');
    await reopenTillClosing(no, user);
    revalidate(no);
    return { updated: true };
  });
}

export async function postTillClosingRequest(no: string): Promise<ActionResult<PostTillClosingResult>> {
  return actionResult(async () => {
    const user = await requireAction('TILL_CLOSINGS_POST');
    const res = await postTillClosing(no, user);
    revalidate(no);
    return res;
  });
}

/** The ledger's figures for a till and day — shown live on the form as they are picked. */
export async function previewTillDay(tillBankAccountId: number, date: string) {
  return actionResult(async () => {
    await requireAction('TILL_CLOSINGS_CREATE');
    return tillDayFigures(tillBankAccountId, date);
  });
}
