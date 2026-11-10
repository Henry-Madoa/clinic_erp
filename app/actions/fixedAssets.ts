'use server';

import { revalidatePath } from 'next/cache';
import { requireAction, requireUser } from '@/lib/session';
import { actionResult } from '@/lib/errors';
import { toCents } from '@/lib/format';
import {
  createFaClass, updateFaClass, type FaClassInput,
  createFaSubclass, updateFaSubclass, type FaSubclassInput,
  createFaLocation, updateFaLocation, type FaLocationInput,
  createMaintenance, updateMaintenance, type MaintenanceInput,
  createDepreciationBook, updateDepreciationBook, type DepreciationBookInput,
  createFaPostingGroup, updateFaPostingGroup, type FaPostingGroupInput,
  saveFaSetup, type FaSetupInput,
} from '@/lib/fixedAssetsSetup';
import {
  createFixedAsset, updateFixedAsset, type FixedAssetInput,
  getFaDepreciationBooks, setFaDepreciationBook, type FaDepreciationBookInput,
  listFaLedgerEntries,
} from '@/lib/fixedAssets';
import {
  createFaJournalLine, updateFaJournalLine, deleteFaJournalLine,
  submitFaJournalLine, cancelFaJournalLineApproval, approveFaJournalLine, rejectFaJournalLine,
  reopenFaJournalLine, postFaJournalLine, postAllApprovedFaJournalLines, type FaJournalLineInput,
} from '@/lib/faJournal';
import { calculateDepreciation } from '@/lib/fixedAssetDepreciation';
import { findPendingRoutedTask, decideWorkflowTask } from '@/lib/workflow';
import type {
  ActionResult, FaDepreciationMethod, FaPostingType, FormValues,
} from '@/lib/types';

const revalidate = (): void => revalidatePath('/fixed-assets', 'layout');

const str = (v: unknown): string => String(v ?? '').trim();
const opt = (v: unknown): string | null => (str(v) === '' ? null : str(v));
const numOrNull = (v: unknown): number | null => (v === undefined || v === '' || v === null ? null : Number(v));
const toFaClassInput = (v: FormValues): FaClassInput => ({
  code: str(v.code), description: str(v.description), status: (str(v.status || 'ACTIVE') as 'ACTIVE' | 'INACTIVE'),
});
export async function createFaClassRequest(v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const res = await createFaClass(toFaClassInput(v), user); revalidate(); return res;
  });
}
export async function updateFaClassRequest(id: number, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    await updateFaClass(id, toFaClassInput(v), user); revalidate(); return { id };
  });
}
const toFaSubclassInput = (v: FormValues): FaSubclassInput => ({
  code: str(v.code), description: str(v.description), faClassCode: opt(v.fa_class_code),
  status: (str(v.status || 'ACTIVE') as 'ACTIVE' | 'INACTIVE'),
});
export async function createFaSubclassRequest(v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const res = await createFaSubclass(toFaSubclassInput(v), user); revalidate(); return res;
  });
}
export async function updateFaSubclassRequest(id: number, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    await updateFaSubclass(id, toFaSubclassInput(v), user); revalidate(); return { id };
  });
}
const toFaLocationInput = (v: FormValues): FaLocationInput => ({
  code: str(v.code), description: str(v.description), status: (str(v.status || 'ACTIVE') as 'ACTIVE' | 'INACTIVE'),
});
export async function createFaLocationRequest(v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const res = await createFaLocation(toFaLocationInput(v), user); revalidate(); return res;
  });
}
export async function updateFaLocationRequest(id: number, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    await updateFaLocation(id, toFaLocationInput(v), user); revalidate(); return { id };
  });
}
const toMaintenanceInput = (v: FormValues): MaintenanceInput => ({
  code: str(v.code), description: str(v.description), status: (str(v.status || 'ACTIVE') as 'ACTIVE' | 'INACTIVE'),
});
export async function createMaintenanceRequest(v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const res = await createMaintenance(toMaintenanceInput(v), user); revalidate(); return res;
  });
}
export async function updateMaintenanceRequest(id: number, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    await updateMaintenance(id, toMaintenanceInput(v), user); revalidate(); return { id };
  });
}
const toDepreciationBookInput = (v: FormValues): DepreciationBookInput => ({
  code: str(v.code), description: str(v.description),
  defaultFinalRoundingAmount: toCents(v.default_final_rounding_amount),
  useRoundingInPeriodicDepr: v.use_rounding_in_periodic_depr === 'on' || v.use_rounding_in_periodic_depr === 'true',
});
export async function createDepreciationBookRequest(v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const res = await createDepreciationBook(toDepreciationBookInput(v), user); revalidate(); return res;
  });
}
export async function updateDepreciationBookRequest(id: number, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    await updateDepreciationBook(id, toDepreciationBookInput(v), user); revalidate(); return { id };
  });
}
const toFaPostingGroupInput = (v: FormValues): FaPostingGroupInput => ({
  code: str(v.code),
  description: str(v.description),
  acquisitionCostAccountId: Number(v.acquisition_cost_account_id),
  accumDepreciationAccountId: Number(v.accum_depreciation_account_id),
  depreciationExpenseAccountId: Number(v.depreciation_expense_account_id),
  writeDownExpenseAccountId: Number(v.write_down_expense_account_id),
  appreciationAccountId: Number(v.appreciation_account_id),
  maintenanceExpenseAccountId: Number(v.maintenance_expense_account_id),
  gainsAccOnDisposalId: Number(v.gains_acc_on_disposal_id),
  lossesAccOnDisposalId: Number(v.losses_acc_on_disposal_id),
});
export async function createFaPostingGroupRequest(v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const res = await createFaPostingGroup(toFaPostingGroupInput(v), user); revalidate(); return res;
  });
}
export async function updateFaPostingGroupRequest(id: number, v: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    await updateFaPostingGroup(id, toFaPostingGroupInput(v), user); revalidate(); return { id };
  });
}
export async function saveFaSetupRequest(v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_SETUP_MANAGE');
    const input: FaSetupInput = {
      defaultDepreciationBookCode: opt(v.default_depreciation_book_code),
      defaultFaPostingGroupCode: opt(v.default_fa_posting_group_code),
      allowFaPostingFrom: opt(v.allow_fa_posting_from),
      allowFaPostingTo: opt(v.allow_fa_posting_to),
    };
    await saveFaSetup(input, user); revalidate(); return { saved: true };
  });
}

/* ------------------------------------------------------------------- Fixed Asset */

const toFixedAssetInput = (v: FormValues): FixedAssetInput => ({
  description: str(v.description),
  description2: opt(v.description2),
  faClassCode: opt(v.faClassCode),
  faSubclassCode: opt(v.faSubclassCode),
  faLocationCode: opt(v.faLocationCode),
  responsibleEmployee: opt(v.responsibleEmployee),
  serialNo: opt(v.serialNo),
  vendorName: opt(v.vendorName),
  assetTag: opt(v.assetTag),
  globalDimension1Id: v.globalDimension1Id ? Number(v.globalDimension1Id) : null,
  globalDimension2Id: v.globalDimension2Id ? Number(v.globalDimension2Id) : null,
  blocked: v.blocked === 'on' || v.blocked === 'true',
  inactive: v.inactive === 'on' || v.inactive === 'true',
});
export async function requestFixedAsset(v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_ASSET_MANAGE');
    const res = await createFixedAsset(toFixedAssetInput(v), user); revalidate(); return res;
  });
}
export async function saveFixedAsset(no: string, v: FormValues): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_ASSET_MANAGE');
    await updateFixedAsset(no, toFixedAssetInput(v), user); revalidate(); return { updated: true };
  });
}

/* --------------------------------------------------------- FA Depreciation Book */

export async function getFaDepreciationBooksRequest(fixedAssetId: number) {
  return actionResult(async () => { await requireAction('FIXED_ASSETS_READ'); return getFaDepreciationBooks(fixedAssetId); });
}
export async function saveFaDepreciationBook(fixedAssetId: number, v: FormValues): Promise<ActionResult<{ saved: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_ASSET_MANAGE');
    const input: FaDepreciationBookInput = {
      depreciationBookCode: str(v.depreciationBookCode),
      faPostingGroupCode: str(v.faPostingGroupCode),
      depreciationMethod: (str(v.depreciationMethod || 'Straight-Line') as FaDepreciationMethod),
      depreciationStartingDate: opt(v.depreciationStartingDate),
      depreciationEndingDate: opt(v.depreciationEndingDate),
      noOfDepreciationYears: numOrNull(v.noOfDepreciationYears),
      straightLinePct: Number(v.straightLinePct || 0),
      decliningBalancePct: Number(v.decliningBalancePct || 0),
      salvageValue: toCents(v.salvageValue),
      disposalCalculationMethod: (str(v.disposalCalculationMethod || 'Net') as 'Net' | 'Gross'),
    };
    await setFaDepreciationBook(fixedAssetId, input, user); revalidate(); return { saved: true };
  });
}
export async function listFaLedgerEntriesRequest(opts: Parameters<typeof listFaLedgerEntries>[0]) {
  return actionResult(async () => { await requireAction('FIXED_ASSETS_READ'); return listFaLedgerEntries(opts); });
}

const toFaJournalLineInput = (v: FormValues): FaJournalLineInput => ({
  postingDate: str(v.postingDate),
  documentNo: opt(v.documentNo),
  fixedAssetId: Number(v.fixedAssetId),
  depreciationBookCode: str(v.depreciationBookCode),
  faPostingType: (str(v.faPostingType || 'Acquisition Cost') as FaPostingType),
  amount: toCents(v.amount),
  balancingGlAccountId: v.balancingGlAccountId ? Number(v.balancingGlAccountId) : null,
  maintenanceCode: opt(v.maintenanceCode),
  description: opt(v.description),
});

export async function requestFaJournalLine(v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_CREATE');
    const res = await createFaJournalLine(toFaJournalLineInput(v), user); revalidate(); return res;
  });
}
export async function saveFaJournalLine(no: string, v: FormValues): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_CREATE');
    await updateFaJournalLine(no, toFaJournalLineInput(v), user); revalidate(); return { updated: true };
  });
}
export async function deleteFaJournalLineRequest(no: string): Promise<ActionResult<{ deleted: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_CREATE');
    await deleteFaJournalLine(no, user); revalidate(); return { deleted: true };
  });
}
export async function submitFaJournalLineRequest(no: string): Promise<ActionResult<{ updated: true; autoApproved: boolean }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_CREATE');
    const { autoApproved } = await submitFaJournalLine(no, user); revalidate(); return { updated: true, autoApproved };
  });
}
export async function cancelFaJournalLineApprovalRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_CREATE');
    await cancelFaJournalLineApproval(no, user); revalidate(); return { updated: true };
  });
}
export async function approveFaJournalLineRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('FA_JOURNAL', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, true, null, user);
    } else {
      const user = await requireAction('FIXED_ASSETS_JOURNAL_APPROVE');
      await approveFaJournalLine(no, user);
    }
    revalidate();
    return { updated: true };
  });
}
export async function rejectFaJournalLineRequest(no: string, reason: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('FA_JOURNAL', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, false, reason || null, user);
    } else {
      const user = await requireAction('FIXED_ASSETS_JOURNAL_APPROVE');
      await rejectFaJournalLine(no, reason || null, user);
    }
    revalidate();
    return { updated: true };
  });
}
export async function reopenFaJournalLineRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_APPROVE');
    await reopenFaJournalLine(no, user); revalidate(); return { updated: true };
  });
}
export async function postFaJournalLineRequest(no: string): Promise<ActionResult<{ journalNo: string | null; bookValue: number; disposed: boolean }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_POST');
    const res = await postFaJournalLine(no, user); revalidate(); return res;
  });
}
export async function postAllApprovedFaJournalLinesRequest(bookCode: string | null): Promise<ActionResult<{ posted: number; total: number; failures: { no: string; error: string }[] }>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_JOURNAL_POST');
    const res = await postAllApprovedFaJournalLines(bookCode, user); revalidate(); return res;
  });
}

/* ------------------------------------------------------- Calculate Depreciation */

export async function calculateDepreciationRequest(
  bookCode: string, faPostingDate: string, onlyFixedAssetId?: number | null,
): Promise<ActionResult<Awaited<ReturnType<typeof calculateDepreciation>>>> {
  return actionResult(async () => {
    const user = await requireAction('FIXED_ASSETS_DEPRECIATION_RUN');
    const res = await calculateDepreciation(bookCode, faPostingDate, user, { onlyFixedAssetId: onlyFixedAssetId ?? null });
    revalidate();
    return res;
  });
}
