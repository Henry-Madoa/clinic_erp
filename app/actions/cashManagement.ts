'use server';

import { revalidatePath } from 'next/cache';
import { requireAction, requireUser } from '@/lib/session';
import { actionResult } from '@/lib/errors';
import {
  createCashTransfer, updateCashTransfer, deleteCashTransfer, setCashTransferDenominations,
  submitCashTransfer, cancelCashTransferApproval, approveCashTransfer, rejectCashTransfer,
  processCashTransfer, listBankAccountsByType, listOtherTills, myCashAutoAccount,
  type CashTransferInput, type CashAccountBrief,
} from '@/lib/cashManagement';
import { cashierSetupForUser } from '@/lib/cashierSetup';
import { findPendingRoutedTask, decideWorkflowTask } from '@/lib/workflow';
import type { ActionResult, BankAccountType, FormValues, CashTransferType } from '@/lib/types';

const REVALIDATE = ['/branch-cash', '/approvals', '/accounting'];
const revalidate = (no?: string) => {
  for (const p of REVALIDATE) revalidatePath(p);
  if (no) revalidatePath(`/branch-cash/view/${no}`);
};

const toInput = (values: FormValues): CashTransferInput => ({
  documentType: String(values.documentType) as CashTransferType,
  counterpartyBankAccountId: Number(values.counterpartyBankAccountId),
  amount: values.amount ? Math.round(Number(values.amount) * 100) : 0,
});

export async function requestCashTransfer(values: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    const res = await createCashTransfer(toInput(values), user);
    revalidate();
    return res;
  });
}

export async function saveCashTransfer(no: string, values: FormValues): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    await updateCashTransfer(no, toInput(values), user);
    revalidate(no);
    return { updated: true };
  });
}

export async function saveCashTransferDenominations(
  no: string, lines: { denominationId: number; quantity: number }[],
): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    await setCashTransferDenominations(no, lines, user);
    revalidate(no);
    return { updated: true };
  });
}

export async function deleteCashTransferRequest(no: string): Promise<ActionResult<{ deleted: true }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    await deleteCashTransfer(no, user);
    revalidate();
    return { deleted: true };
  });
}

export async function submitCashTransferRequest(no: string): Promise<ActionResult<{ updated: true; autoApproved: boolean }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    const { autoApproved } = await submitCashTransfer(no, user);
    revalidate(no);
    return { updated: true, autoApproved };
  });
}

export async function cancelCashTransferApprovalRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    await cancelCashTransferApproval(no, user);
    revalidate(no);
    return { updated: true };
  });
}

export async function approveCashTransferRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('CASH_OFFICE_TRANSFER', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, true, null, user);
    } else {
      const user = await requireAction('CASH_MANAGEMENT_APPROVE');
      await approveCashTransfer(no, user);
    }
    revalidate(no);
    return { updated: true };
  });
}

export async function rejectCashTransferRequest(no: string, reason: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('CASH_OFFICE_TRANSFER', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, false, reason || null, user);
    } else {
      const user = await requireAction('CASH_MANAGEMENT_APPROVE');
      await rejectCashTransfer(no, reason || null, user);
    }
    revalidate(no);
    return { updated: true };
  });
}

export async function postCashTransferRequest(no: string): Promise<ActionResult<{ journalNo: string; amount: number }>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_POST');
    const res = await processCashTransfer(no, user);
    revalidate(no);
    return res;
  });
}

/** The end of the movement auto-resolved from the user's own Cashier Setup (with capacity
 *  limits) — the New form uses it to pre-fill / cap the Amount against the real ceiling. */
export async function myCashAutoAccountFor(
  documentType: CashTransferType,
): Promise<ActionResult<(CashAccountBrief & { role: 'SOURCE' | 'DESTINATION' }) | null>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    return myCashAutoAccount(documentType, user);
  });
}

/** The counterparty account picklist for a given document type — the side the creator picks. */
export async function counterpartyAccountsFor(
  documentType: CashTransferType, counterpartyType: BankAccountType,
): Promise<ActionResult<CashAccountBrief[]>> {
  return actionResult(async () => {
    const user = await requireAction('CASH_MANAGEMENT_CREATE');
    if (documentType === 'INTER_TILL') {
      const mine = await cashierSetupForUser(user.username);
      return listOtherTills(mine?.bank_account_id ?? 0);
    }
    return listBankAccountsByType(counterpartyType);
  });
}
