/*
 * Unit of Measure conversion — Business Central Table 5404 "Item Unit of Measure". Every unit an
 * item may be entered in converts to that item's own Base Unit of Measure directly (never
 * UoM-to-UoM — this is exactly Business Central's own model): 1 BOX might be 12 EACH, 1 CASE might
 * be 4 BOX, but a CASE-to-BOX conversion is never computed by chaining through EACH twice, it just
 * carries its own qty_per_unit_of_measure relative to Base. No AL source exists for any of this —
 * see lib/itemJournal.ts's header for the full design rationale.
 */
import { one, all, run, tx, audit } from './db.ts';
import { AppError } from './errors.ts';
import type { Actor, ItemUnitOfMeasureView } from './types.ts';

export const itemUnitsOfMeasure = (itemId: number): Promise<ItemUnitOfMeasureView[]> =>
  all<ItemUnitOfMeasureView>(
    `SELECT ium.*, uom.code AS unit_of_measure_code, uom.description AS unit_of_measure_description
     FROM item_unit_of_measure ium JOIN unit_of_measure uom ON uom.id = ium.unit_of_measure_id
     WHERE ium.item_id = ?
     ORDER BY uom.code`,
    itemId,
  );

/** This unit's conversion factor to `itemId`'s own Base UoM — 1 for the Base UoM itself, or
 *  whatever item_unit_of_measure has on file. Throws if the unit isn't set up for this item at
 *  all (Business Central refuses to post a line in a UoM the item doesn't recognise). */
export async function qtyPerUnitOfMeasure(itemId: number, unitOfMeasureId: number): Promise<number> {
  const item = await one<{ base_unit_of_measure_id: number }>(
    'SELECT base_unit_of_measure_id FROM item WHERE id = ?', itemId,
  );
  if (!item) throw new AppError('Item not found', 'NOT_FOUND');
  if (unitOfMeasureId === item.base_unit_of_measure_id) return 1;
  const row = await one<{ qty_per_unit_of_measure: number }>(
    'SELECT qty_per_unit_of_measure FROM item_unit_of_measure WHERE item_id = ? AND unit_of_measure_id = ?',
    itemId, unitOfMeasureId,
  );
  if (!row) throw new AppError('That unit of measure is not set up for this item', 'VALIDATION');
  return row.qty_per_unit_of_measure;
}

/** `quantity`, entered in `unitOfMeasureId`, converted to the item's Base UoM. */
export async function convertToBase(itemId: number, unitOfMeasureId: number, quantity: number): Promise<number> {
  const factor = await qtyPerUnitOfMeasure(itemId, unitOfMeasureId);
  return quantity * factor;
}

/** `baseQuantity` (already in the item's Base UoM) expressed in `unitOfMeasureId` instead — for
 *  display only (e.g. "show qty-on-hand in BOX"); may not be a whole number if it doesn't divide
 *  evenly, which is left to the caller to round or report as a fraction. */
export async function convertFromBase(itemId: number, unitOfMeasureId: number, baseQuantity: number): Promise<number> {
  const factor = await qtyPerUnitOfMeasure(itemId, unitOfMeasureId);
  return factor > 0 ? baseQuantity / factor : baseQuantity;
}

export interface ItemUnitOfMeasureLineInput {
  unitOfMeasureId: number;
  qtyPerUnitOfMeasure: number;
}

/**
 * Replaces an item's full Item Unit of Measure line set. The item's own Base UoM always gets an
 * implicit qty_per_unit_of_measure = 1 row (added here regardless of what's in `lines`); its
 * Purchase/Sales UoM (wherever set) must each resolve to one of `lines` — Business Central's own
 * validation that an item's Purch./Sales UoM is never picked from thin air.
 */
export async function setItemUnitsOfMeasure(
  itemId: number, lines: ItemUnitOfMeasureLineInput[], user: Actor,
): Promise<void> {
  const item = await one<{
    base_unit_of_measure_id: number; purch_unit_of_measure_id: number | null; sales_unit_of_measure_id: number | null;
  }>(
    'SELECT base_unit_of_measure_id, purch_unit_of_measure_id, sales_unit_of_measure_id FROM item WHERE id = ?',
    itemId,
  );
  if (!item) throw new AppError('Item not found', 'NOT_FOUND');

  // Stock is held in whole base units, so every other unit must be a whole number of them: the Base
  // UoM is the smallest unit an item moves in (1 CTN = 24 BTL; for grams, the gram is the base).
  // A factor below 1 or with a fraction used to be rounded on save — 0.4 became 0 and every
  // conversion through it silently came out as nothing.
  for (const l of lines) {
    if (l.unitOfMeasureId === item.base_unit_of_measure_id) continue;
    if (!Number.isInteger(l.qtyPerUnitOfMeasure) || l.qtyPerUnitOfMeasure < 1) {
      throw new AppError(
        'Each unit must be a whole number of the base unit (e.g. 1 CTN = 24 BTL). If you need a smaller unit, make it the Base Unit of Measure',
        'VALIDATION',
      );
    }
  }
  const byUom = new Map(lines.map((l) => [l.unitOfMeasureId, l]));
  byUom.set(item.base_unit_of_measure_id, { unitOfMeasureId: item.base_unit_of_measure_id, qtyPerUnitOfMeasure: 1 });
  if (item.purch_unit_of_measure_id && !byUom.has(item.purch_unit_of_measure_id)) {
    throw new AppError('The Purchase Unit of Measure needs its own conversion line', 'VALIDATION');
  }
  if (item.sales_unit_of_measure_id && !byUom.has(item.sales_unit_of_measure_id)) {
    throw new AppError('The Sales Unit of Measure needs its own conversion line', 'VALIDATION');
  }

  await tx(async () => {
    await run('DELETE FROM item_unit_of_measure WHERE item_id = ?', itemId);
    for (const l of byUom.values()) {
      await run(
        'INSERT INTO item_unit_of_measure (item_id, unit_of_measure_id, qty_per_unit_of_measure) VALUES (?,?,?)',
        itemId, l.unitOfMeasureId, l.qtyPerUnitOfMeasure,
      );
    }
  });
  await audit(user, 'ITEM_UOM_SET', 'item', itemId, { count: byUom.size });
}

/** Every active item's units for line editors, in one query: item no → its units (base first, with
 *  factors) and the unit a purchase line defaults to (the Purchase UoM, else the base). */
export async function itemUnitOptions(): Promise<Record<string, { units: { code: string; factor: number }[]; purchaseDefault: string }>> {
  const rows = await all<{ no: string; code: string; factor: number; is_base: boolean; purch_code: string | null; base_code: string }>(
    `SELECT i.no, u.code, ium.qty_per_unit_of_measure AS factor, (ium.unit_of_measure_id = i.base_unit_of_measure_id) AS is_base,
            pu.code AS purch_code, bu.code AS base_code
     FROM item i JOIN item_unit_of_measure ium ON ium.item_id = i.id JOIN unit_of_measure u ON u.id = ium.unit_of_measure_id
     JOIN unit_of_measure bu ON bu.id = i.base_unit_of_measure_id LEFT JOIN unit_of_measure pu ON pu.id = i.purch_unit_of_measure_id
     WHERE i.status = 'ACTIVE' ORDER BY i.no, is_base DESC, ium.qty_per_unit_of_measure`);
  const out: Record<string, { units: { code: string; factor: number }[]; purchaseDefault: string }> = {};
  for (const r of rows) {
    const o = (out[r.no] ??= { units: [], purchaseDefault: r.purch_code ?? r.base_code });
    o.units.push({ code: r.code, factor: Number(r.factor) });
  }
  return out;
}
