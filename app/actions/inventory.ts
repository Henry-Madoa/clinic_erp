'use server';

import { revalidatePath } from 'next/cache';
import { requireAction, requireUser } from '@/lib/session';
import { actionResult } from '@/lib/errors';
import { toCents } from '@/lib/format';
import {
  createLocation, updateLocation, type LocationInput,
  createUnitOfMeasure, updateUnitOfMeasure, type UnitOfMeasureInput,
  createInventoryPostingGroup, updateInventoryPostingGroup, type InventoryPostingGroupInput,
  createProductPostingGroup, updateProductPostingGroup, type ProductPostingGroupInput,
} from '@/lib/inventorySetup';
import {
  itemStockByLocation, createItem, updateItem, type ItemInput,
} from '@/lib/items';
import { itemUnitsOfMeasure, type ItemUnitOfMeasureLineInput } from '@/lib/unitOfMeasureConversion';
import * as stockCount from '@/lib/stockCount';
import {
  openLotsForItem, listItemLedgerEntries, 
  createItemJournalLine, updateItemJournalLine, deleteItemJournalLine, submitItemJournalLine,
  cancelItemJournalLineApproval, approveItemJournalLine, rejectItemJournalLine, reopenItemJournalLine,
  postItemJournalLine, type ItemJournalLineInput,
} from '@/lib/itemJournal';
import { findPendingRoutedTask, decideWorkflowTask } from '@/lib/workflow';
import type { ActionResult, FormValues, ItemCostingMethod, ItemJournalEntryType, ItemReorderingPolicy } from '@/lib/types';

const revalidate = () => revalidatePath('/inventory', 'layout');

const toLocationInput = (values: FormValues): LocationInput => ({
  code: String(values.code || ''),
  name: String(values.name || ''),
  address: values.address ? String(values.address) : null,
  status: (String(values.status || 'ACTIVE') as 'ACTIVE' | 'INACTIVE'),
});

export async function createLocationRequest(values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    const res = await createLocation(toLocationInput(values), user);
    revalidate();
    return res;
  });
}

export async function updateLocationRequest(id: number, values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    await updateLocation(id, toLocationInput(values), user);
    revalidate();
    return { id };
  });
}

const toUnitOfMeasureInput = (values: FormValues): UnitOfMeasureInput => ({
  code: String(values.code || ''),
  description: String(values.description || ''),
  symbol: values.symbol ? String(values.symbol) : null,
});

export async function createUnitOfMeasureRequest(values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    const res = await createUnitOfMeasure(toUnitOfMeasureInput(values), user);
    revalidate();
    return res;
  });
}

export async function updateUnitOfMeasureRequest(id: number, values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    await updateUnitOfMeasure(id, toUnitOfMeasureInput(values), user);
    revalidate();
    return { id };
  });
}

const toInventoryPostingGroupInput = (values: FormValues): InventoryPostingGroupInput => ({
  code: String(values.code || ''),
  description: String(values.description || ''),
  inventoryGlAccountId: Number(values.inventory_gl_account_id),
});

export async function createInventoryPostingGroupRequest(values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    const res = await createInventoryPostingGroup(toInventoryPostingGroupInput(values), user);
    revalidate();
    return res;
  });
}

export async function updateInventoryPostingGroupRequest(id: number, values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    await updateInventoryPostingGroup(id, toInventoryPostingGroupInput(values), user);
    revalidate();
    return { id };
  });
}

const toProductPostingGroupInput = (values: FormValues): ProductPostingGroupInput => ({
  code: String(values.code || ''),
  description: String(values.description || ''),
  adjustmentGlAccountId: Number(values.adjustment_gl_account_id),
});

export async function createProductPostingGroupRequest(values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    const res = await createProductPostingGroup(toProductPostingGroupInput(values), user);
    revalidate();
    return res;
  });
}

export async function updateProductPostingGroupRequest(id: number, values: FormValues): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_SETUP_MANAGE');
    await updateProductPostingGroup(id, toProductPostingGroupInput(values), user);
    revalidate();
    return { id };
  });
}

/* -------------------------------------------------------------------------- items */

export interface UomLineDraft {
  unitOfMeasureId: string;
  qtyPerUnitOfMeasure: string;
}

const toUomLines = (lines: UomLineDraft[]): ItemUnitOfMeasureLineInput[] =>
  lines
    .filter((l) => l.unitOfMeasureId)
    .map((l) => ({
      unitOfMeasureId: Number(l.unitOfMeasureId),
      qtyPerUnitOfMeasure: Number(l.qtyPerUnitOfMeasure || 1),
    }));

const toItemInput = (values: FormValues, unitsOfMeasure: UomLineDraft[]): ItemInput => ({
  description: String(values.description || ''),
  description2: values.description2 ? String(values.description2) : null,
  baseUnitOfMeasureId: Number(values.baseUnitOfMeasureId),
  purchUnitOfMeasureId: values.purchUnitOfMeasureId ? Number(values.purchUnitOfMeasureId) : null,
  salesUnitOfMeasureId: values.salesUnitOfMeasureId ? Number(values.salesUnitOfMeasureId) : null,
  inventoryPostingGroupId: Number(values.inventoryPostingGroupId),
  productPostingGroupId: Number(values.productPostingGroupId),
  costingMethod: (String(values.costingMethod || 'FIFO') as ItemCostingMethod),
  unitCost: toCents(values.unitCost),
  unitPrice: toCents(values.unitPrice),
  reorderingPolicy: (String(values.reorderingPolicy || 'Fixed Reorder Qty.') as ItemReorderingPolicy),
  reorderPoint: Math.round(Number(values.reorderPoint || 0)),
  reorderQuantity: Math.round(Number(values.reorderQuantity || 0)),
  maximumInventory: Math.round(Number(values.maximumInventory || 0)),
  status: (String(values.status || 'ACTIVE') as 'ACTIVE' | 'BLOCKED'),
  unitsOfMeasure: toUomLines(unitsOfMeasure),
});

export async function itemStockByLocationRequest(no: string) {
  return actionResult(async () => {
    await requireAction('INVENTORY_READ');
    return itemStockByLocation(no);
  });
}

export async function itemUnitsOfMeasureRequest(itemId: number) {
  return actionResult(async () => {
    await requireAction('INVENTORY_READ');
    return itemUnitsOfMeasure(itemId);
  });
}

export async function requestItem(values: FormValues, unitsOfMeasure: UomLineDraft[]): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_ITEM_MANAGE');
    const res = await createItem(toItemInput(values, unitsOfMeasure), user);
    revalidate();
    return res;
  });
}

export async function saveItem(
  no: string, values: FormValues, unitsOfMeasure: UomLineDraft[],
): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_ITEM_MANAGE');
    await updateItem(no, toItemInput(values, unitsOfMeasure), user);
    revalidate();
    return { updated: true };
  });
}

export async function openLotsForItemRequest(itemId: number, locationId: number) {
  return actionResult(async () => {
    await requireAction('INVENTORY_READ');
    return openLotsForItem(itemId, locationId);
  });
}

export async function listItemLedgerEntriesRequest(opts: Parameters<typeof listItemLedgerEntries>[0]) {
  return actionResult(async () => {
    await requireAction('INVENTORY_READ');
    return listItemLedgerEntries(opts);
  });
}

const toItemJournalLineInput = (values: FormValues): ItemJournalLineInput => ({
  postingDate: String(values.postingDate || ''),
  entryType: (String(values.entryType || 'Positive Adjmt.') as ItemJournalEntryType),
  itemId: Number(values.itemId),
  locationId: Number(values.locationId),
  newLocationId: values.newLocationId ? Number(values.newLocationId) : null,
  description: values.description ? String(values.description) : null,
  unitOfMeasureId: Number(values.unitOfMeasureId),
  quantity: Number(values.quantity || 0),
  unitCost: values.unitCost !== undefined && values.unitCost !== '' ? toCents(values.unitCost) : null,
  appliesToEntryId: values.appliesToEntryId ? Number(values.appliesToEntryId) : null,
});

export async function requestItemJournalLine(values: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_CREATE');
    const res = await createItemJournalLine(toItemJournalLineInput(values), user);
    revalidate();
    return res;
  });
}

export async function saveItemJournalLine(no: string, values: FormValues): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_CREATE');
    await updateItemJournalLine(no, toItemJournalLineInput(values), user);
    revalidate();
    return { updated: true };
  });
}

export async function deleteItemJournalLineRequest(no: string): Promise<ActionResult<{ deleted: true }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_CREATE');
    await deleteItemJournalLine(no, user);
    revalidate();
    return { deleted: true };
  });
}

export async function submitItemJournalLineRequest(no: string): Promise<ActionResult<{ updated: true; autoApproved: boolean }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_CREATE');
    const { autoApproved } = await submitItemJournalLine(no, user);
    revalidate();
    return { updated: true, autoApproved };
  });
}

export async function cancelItemJournalLineApprovalRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_CREATE');
    await cancelItemJournalLineApproval(no, user);
    revalidate();
    return { updated: true };
  });
}

export async function approveItemJournalLineRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('ITEM_JOURNAL', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, true, null, user);
    } else {
      const user = await requireAction('INVENTORY_JOURNAL_APPROVE');
      await approveItemJournalLine(no, user);
    }
    revalidate();
    return { updated: true };
  });
}

export async function rejectItemJournalLineRequest(no: string, reason: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const routed = await findPendingRoutedTask('ITEM_JOURNAL', no);
    if (routed) {
      const user = await requireUser();
      await decideWorkflowTask(routed.id, false, reason || null, user);
    } else {
      const user = await requireAction('INVENTORY_JOURNAL_APPROVE');
      await rejectItemJournalLine(no, reason || null, user);
    }
    revalidate();
    return { updated: true };
  });
}

export async function reopenItemJournalLineRequest(no: string): Promise<ActionResult<{ updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_APPROVE');
    await reopenItemJournalLine(no, user);
    revalidate();
    return { updated: true };
  });
}

export async function postItemJournalLineRequest(
  no: string,
): Promise<ActionResult<{ journalNo: string | null; itemInventory: number }>> {
  return actionResult(async () => {
    const user = await requireAction('INVENTORY_JOURNAL_POST');
    const res = await postItemJournalLine(no, user);
    revalidate();
    return res;
  });
}

/* ------------------------------------------------------------------ physical stock count */

export async function openStockCountRequest(v: FormValues): Promise<ActionResult<{ no: string }>> {
  return actionResult(async () => {
    const user = await requireAction('STOCK_COUNT_ENTER');
    const res = await stockCount.openStockCount(Number(v.location_id), String(v.count_date ?? ''), v.notes ? String(v.notes) : null, user);
    revalidatePath('/inventory', 'layout');
    return res;
  });
}

export async function saveStockCountRequest(no: string, counts: Record<string, string>): Promise<ActionResult<{ saved: number }>> {
  return actionResult(async () => {
    const user = await requireAction('STOCK_COUNT_ENTER');
    const saved = await stockCount.saveCountedQuantities(no, counts ?? {}, user);
    revalidatePath(`/inventory/stock-count/${no}`);
    return { saved };
  });
}

export async function postStockCountRequest(no: string): Promise<ActionResult<{ adjusted: number; journalNo: string | null }>> {
  return actionResult(async () => {
    const user = await requireAction('STOCK_COUNT_POST');
    const r = await stockCount.postStockCount(no, user);
    revalidatePath('/inventory', 'layout');
    return { adjusted: r.adjusted, journalNo: r.journalNo };
  });
}

export async function cancelStockCountRequest(no: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const user = await requireAction('STOCK_COUNT_ENTER');
    await stockCount.cancelStockCount(no, user);
    revalidatePath('/inventory', 'layout');
    return null;
  });
}
