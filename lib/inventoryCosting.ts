/*
 * Inventory costing primitives — extracted from lib/itemJournal.ts so both the Item Journal
 * (Negative Adjmt.) and a sales shipment / invoice Item line (lib/salesDocuments.ts) cost an
 * outbound movement the same way and record which inbound lot(s) it consumed.
 *
 * costOutbound() is read-only (safe for a live estimate); applyOutboundLots() does the writes
 * (item_application_entry + lot remaining_quantity/open), and is only ever called inside the
 * posting transaction that also inserted the outbound item_ledger_entry.
 *
 * Precision: a lot's value is its exact amount, not quantity × a unit cost rounded to the cent.
 * Items held in small base units (grams, millilitres) cost fractions of a cent each — 25 kg of
 * flour for KSh 3,333 is 13.332 cents a gram — so outbound movements are valued at amount ÷
 * quantity of each lot consumed and rounded once, to the cent, on the movement's total. Callers
 * post CostResult.amount; unitCost is the rounded per-unit figure for display.
 */
import { one, all, run } from './db.ts';
import { AppError } from './errors.ts';
import type { Cents, IsoDate, ItemCostingMethod } from './types.ts';

export interface CostApplication { inboundEntryId: number; quantity: number }
export interface CostResult {
  /** Per base unit, rounded to the cent — for display and the ledger entry's unit_cost. */
  unitCost: Cents;
  /** The movement's exact value (cents) — what posts to the G/L and the item ledger. */
  amount: Cents;
  applications: CostApplication[];
}

/** A lot's exact value per base unit (fractional cents), from its total — never the rounded unit_cost. */
const lotUnitValue = (l: { quantity: number; amount: number; unit_cost: number }): number =>
  Number(l.quantity) > 0 ? Number(l.amount) / Number(l.quantity) : Number(l.unit_cost);

/** Determines an outbound line's cost per `costingMethod`, and — for every method but Standard —
 *  which open inbound lot(s) it consumes. Read-only. */
export async function costOutbound(
  itemId: number, locationId: number, costingMethod: ItemCostingMethod, baseQuantity: number,
  appliesToEntryId: number | null,
): Promise<CostResult> {
  if (costingMethod === 'Standard') {
    const item = await one<{ unit_cost: Cents }>('SELECT unit_cost FROM item WHERE id = ?', itemId);
    const unitCost = Number(item?.unit_cost ?? 0);
    return { unitCost, amount: unitCost * baseQuantity, applications: [] };
  }

  if (costingMethod === 'Specific') {
    if (!appliesToEntryId) throw new AppError('Pick the specific lot this outbound movement applies to', 'VALIDATION');
    const lot = await one<{
      id: number; item_id: number; location_id: number; open: boolean; remaining_quantity: number; unit_cost: Cents; quantity: number; amount: Cents;
    }>(
      'SELECT id, item_id, location_id, open, remaining_quantity, unit_cost, quantity, amount FROM item_ledger_entry WHERE id = ?',
      appliesToEntryId,
    );
    if (!lot || lot.item_id !== itemId || lot.location_id !== locationId || !lot.open) {
      throw new AppError('That lot is not an open inbound entry for this item and location', 'VALIDATION');
    }
    if (lot.remaining_quantity < baseQuantity) {
      throw new AppError(`That lot only has ${lot.remaining_quantity} unit(s) remaining`, 'VALIDATION');
    }
    const amount = Math.round(baseQuantity * lotUnitValue(lot));
    return { unitCost: Math.round(amount / baseQuantity), amount, applications: [{ inboundEntryId: lot.id, quantity: baseQuantity }] };
  }

  const order = costingMethod === 'LIFO' ? 'DESC' : 'ASC';
  const lots = await all<{ id: number; remaining_quantity: number; unit_cost: Cents; quantity: number; amount: Cents }>(
    `SELECT id, remaining_quantity, unit_cost, quantity, amount FROM item_ledger_entry
     WHERE item_id = ? AND location_id = ? AND open = true AND remaining_quantity > 0
     ORDER BY posting_date ${order}, id ${order}`,
    itemId, locationId,
  );
  const totalOpen = lots.reduce((s, l) => s + l.remaining_quantity, 0);
  if (totalOpen < baseQuantity) {
    throw new AppError(
      `Only ${totalOpen} unit(s) are on hand at this location — cannot post an outbound movement of ${baseQuantity}`,
      'VALIDATION',
    );
  }

  let remaining = baseQuantity;
  const applications: CostApplication[] = [];
  let consumedValue = 0;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.remaining_quantity);
    applications.push({ inboundEntryId: lot.id, quantity: take });
    consumedValue += take * lotUnitValue(lot);
    remaining -= take;
  }

  if (costingMethod === 'Average') {
    const totalValue = lots.reduce((s, l) => s + l.remaining_quantity * lotUnitValue(l), 0);
    const avg = totalOpen > 0 ? totalValue / totalOpen : 0;
    const amount = Math.round(avg * baseQuantity);
    return { unitCost: Math.round(avg), amount, applications };
  }
  const amount = Math.round(consumedValue);
  const unitCost = baseQuantity > 0 ? Math.round(amount / baseQuantity) : 0;
  return { unitCost, amount, applications };
}

/**
 * Receives stock for a purchase (BC's "Purchase" Item Ledger Entry): inserts a new inbound,
 * open cost lot at `unitCost`, bumps the stockkeeping_unit + item.inventory roll-ups and stamps
 * `item.unit_cost` (BC's "Last Direct Cost"). Call inside the posting transaction of a purchase
 * receipt / invoice (lib/purchaseDocuments.ts). Returns the new item_ledger_entry id.
 */
export async function receiveItemStock(
  itemId: number, locationId: number, baseQuantity: number, unitCost: Cents,
  documentNo: string, postingDate: IsoDate,
  /** The receipt's exact value (cents); defaults to quantity × unitCost. Pass the invoice line
   *  amount so the stock is valued at what the G/L was charged, not a rounded unit cost. */
  exactAmount?: Cents,
): Promise<number> {
  if (!Number.isInteger(baseQuantity) || baseQuantity <= 0) {
    throw new AppError('Stock is received in whole base units — the quantity must convert to a whole number', 'VALIDATION');
  }
  const qty = baseQuantity;
  const amount = exactAmount ?? qty * unitCost;
  unitCost = Math.round(amount / qty);
  const ile = await run(
    `INSERT INTO item_ledger_entry
       (item_id, location_id, posting_date, entry_type, document_no, quantity, remaining_quantity, open, unit_cost, amount, created_at)
     VALUES (?,?,?, 'Purchase', ?,?,?, true, ?, ?, ?)`,
    itemId, locationId, postingDate, documentNo, qty, qty, unitCost, amount, new Date().toISOString(),
  );
  const sku = await one<{ id: number; inventory: number }>(
    'SELECT id, inventory FROM stockkeeping_unit WHERE item_id = ? AND location_id = ?', itemId, locationId,
  );
  if (!sku) await run('INSERT INTO stockkeeping_unit (item_id, location_id, inventory) VALUES (?,?,?)', itemId, locationId, qty);
  else await run('UPDATE stockkeeping_unit SET inventory = ? WHERE id = ?', sku.inventory + qty, sku.id);
  const roll = await one<{ total: number }>('SELECT COALESCE(SUM(inventory),0) AS total FROM stockkeeping_unit WHERE item_id = ?', itemId);
  await run('UPDATE item SET inventory = ?, unit_cost = ? WHERE id = ?', roll?.total ?? qty, unitCost, itemId);
  return Number(ile.lastInsertRowid);
}

/** Writes the item_application_entry rows for `outboundEntryId` and draws down each consumed
 *  lot's remaining_quantity / open flag. Call inside the posting transaction. */
export async function applyOutboundLots(
  outboundEntryId: number, applications: CostApplication[], postingDate: IsoDate,
): Promise<void> {
  for (const app of applications) {
    await run(
      `INSERT INTO item_application_entry (outbound_entry_id, inbound_entry_id, quantity, posting_date, created_at)
       VALUES (?,?,?,?,?)`,
      outboundEntryId, app.inboundEntryId, app.quantity, postingDate, new Date().toISOString(),
    );
    const lot = await one<{ remaining_quantity: number }>(
      'SELECT remaining_quantity FROM item_ledger_entry WHERE id = ?', app.inboundEntryId,
    );
    const newRemaining = (lot?.remaining_quantity ?? 0) - app.quantity;
    await run(
      'UPDATE item_ledger_entry SET remaining_quantity = ?, open = ? WHERE id = ?',
      newRemaining, newRemaining > 0, app.inboundEntryId,
    );
  }
}
