import 'server-only';
import { one, all, run, tx, audit, nextSequence } from './db.ts';
import { AppError } from './errors.ts';
import { postJournal } from './accounting.ts';
import { costOutbound, applyOutboundLots } from './inventoryCosting.ts';
import type { Actor, Cents, IsoDate, ItemCostingMethod, JournalLineInput } from './types.ts';
import type { FilterFieldDef } from './listFilters.ts';

/*
 * Physical stock count — Business Central's Physical Inventory Journal for one store.
 *
 *   open    snapshot the system quantity of every active item at the store (qty_calculated)
 *   count   enter what is physically on the shelf (qty_counted, base units)
 *   post    a different user posts: each difference becomes stock in (a new lot at the item's
 *           current cost) or stock out (drawn FIFO at exact lot value), and one journal books
 *           the variance — Dr/Cr Inventory against the item's Inventory Adjustments account.
 *
 * Posting refuses if stock at the store moved after the snapshot (a sale, a transfer): the
 * difference would then be measured against the wrong figure. Recount, or cancel and reopen.
 * The count is where real food and beverage cost meets the recipes' theoretical cost — its
 * shrinkage is the gap.
 */

interface StockCount {
  id: number; no: string; location_id: number; location_code: string; location_name: string; count_date: IsoDate;
  status: 'OPEN' | 'POSTED' | 'CANCELLED'; notes: string | null; total_variance: Cents; journal_no: string | null;
  created_at: string; created_by: string; posted_at: string | null; posted_by: string | null;
  lines_total?: number; lines_counted?: number;
}
export interface StockCountLine {
  id: number; item_id: number; item_no: string; description: string; unit: string; unit_cost: Cents;
  qty_calculated: number; qty_counted: number | null; on_hand_now: number; variance_amount: Cents | null;
}

const HEAD = `
  SELECT c.*, l.code AS location_code, l.name AS location_name, j.journal_no,
         (SELECT COUNT(*)::int FROM stock_count_line x WHERE x.stock_count_id = c.id) AS lines_total,
         (SELECT COUNT(*)::int FROM stock_count_line x WHERE x.stock_count_id = c.id AND x.qty_counted IS NOT NULL) AS lines_counted
  FROM stock_count c JOIN location l ON l.id = c.location_id LEFT JOIN journal j ON j.id = c.journal_id`;

/** The recent counts are filtered in memory (lib/listFilters.ts filterRows). */
export const STOCK_COUNT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text' },
  { key: 'location_code', label: 'Store', type: 'text' },
  { key: 'count_date', label: 'Date', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'OPEN', label: 'Open' }, { value: 'POSTED', label: 'Posted' }, { value: 'CANCELLED', label: 'Cancelled' }] },
  { key: 'total_variance', label: 'Variance', type: 'number', cents: true },
  { key: 'created_by', label: 'Opened by', type: 'text' },
  { key: 'posted_by', label: 'Posted by', type: 'text' },
];

export const listStockCounts = (): Promise<StockCount[]> => all<StockCount>(`${HEAD} ORDER BY c.id DESC LIMIT 100`);

export async function getStockCount(no: string): Promise<(StockCount & { lines: StockCountLine[] }) | undefined> {
  const c = await one<StockCount>(`${HEAD} WHERE c.no = ?`, no);
  if (!c) return undefined;
  const lines = await all<StockCountLine>(
    `SELECT s.id, s.item_id, i.no AS item_no, i.description, u.code AS unit, i.unit_cost, s.qty_calculated, s.qty_counted,
            COALESCE(k.inventory, 0) AS on_hand_now, s.variance_amount
     FROM stock_count_line s JOIN item i ON i.id = s.item_id JOIN unit_of_measure u ON u.id = i.base_unit_of_measure_id
     LEFT JOIN stockkeeping_unit k ON k.item_id = s.item_id AND k.location_id = ?
     WHERE s.stock_count_id = ? ORDER BY i.description`, c.location_id, c.id);
  return { ...c, lines };
}

/** Opens a count of `locationId`: every active item stocked there (or ever posted there), at
 *  today's system quantity. One open count per store at a time. */
export async function openStockCount(locationId: number, countDate: IsoDate, notes: string | null, user: Actor): Promise<{ no: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(countDate))) throw new AppError('Pick the count date', 'VALIDATION');
  return tx(async () => {
    const loc = await one<{ id: number; status: string }>('SELECT id, status FROM location WHERE id = ? FOR UPDATE', locationId);
    if (!loc || loc.status !== 'ACTIVE') throw new AppError('Pick an active store', 'VALIDATION');
    if (await one("SELECT 1 FROM stock_count WHERE location_id = ? AND status = 'OPEN'", locationId)) {
      throw new AppError('This store already has an open count — post or cancel it first', 'VALIDATION');
    }
    const no = await nextSequence('STOCK_COUNT');
    const id = (await run('INSERT INTO stock_count (no, location_id, count_date, notes, created_at, created_by) VALUES (?,?,?,?,?,?)',
      no, locationId, countDate, String(notes ?? '').trim().slice(0, 500) || null, new Date().toISOString(), user.username)).lastInsertRowid;
    await run(
      `INSERT INTO stock_count_line (stock_count_id, item_id, qty_calculated)
       SELECT ?, i.id, COALESCE(k.inventory, 0) FROM item i
       LEFT JOIN stockkeeping_unit k ON k.item_id = i.id AND k.location_id = ?
       WHERE i.status = 'ACTIVE' AND (k.id IS NOT NULL OR EXISTS (SELECT 1 FROM item_ledger_entry e WHERE e.item_id = i.id AND e.location_id = ?))`,
      id, locationId, locationId);
    await audit(user, 'STOCK_COUNT_OPEN', 'stock_count', no, { locationId });
    return { no };
  });
}

/** Saves counted quantities (base units). Blank = not counted; only an open count. */
export async function saveCountedQuantities(no: string, counts: Record<string, unknown>, user: Actor): Promise<number> {
  return tx(async () => {
    const c = await one<{ id: number; status: string }>('SELECT id, status FROM stock_count WHERE no = ? FOR UPDATE', no);
    if (!c) throw new AppError('Stock count not found', 'NOT_FOUND');
    if (c.status !== 'OPEN') throw new AppError(`This count is ${c.status.toLowerCase()}`, 'VALIDATION');
    const lineIds = new Set((await all<{ id: number }>('SELECT id FROM stock_count_line WHERE stock_count_id = ?', c.id)).map((l) => l.id));
    const params: unknown[] = [];
    for (const [key, raw] of Object.entries(counts)) {
      const id = Number(key);
      if (!lineIds.has(id)) continue; // only this count's own lines — never another count's by id
      const v = String(raw ?? '').trim();
      if (v === '') { params.push(id, null); continue; }
      const q = Number(v);
      if (!Number.isInteger(q) || q < 0 || q > 1e9) throw new AppError('Counted quantities are whole numbers of the base unit, zero or more', 'VALIDATION');
      params.push(id, q);
    }
    if (params.length) {
      await run(`UPDATE stock_count_line AS s SET qty_counted = v.q FROM (VALUES ${Array.from({ length: params.length / 2 }, () => '(?::int, ?::int)').join(',')}) AS v(id, q)
                 WHERE s.id = v.id AND s.stock_count_id = ?`, ...params, c.id);
    }
    await audit(user, 'STOCK_COUNT_ENTER', 'stock_count', no, { lines: params.length / 2 });
    return params.length / 2;
  });
}

export async function cancelStockCount(no: string, user: Actor): Promise<void> {
  const r = await run("UPDATE stock_count SET status = 'CANCELLED' WHERE no = ? AND status = 'OPEN'", no);
  if (!r.changes) throw new AppError('Only an open count can be cancelled', 'VALIDATION');
  await audit(user, 'STOCK_COUNT_CANCEL', 'stock_count', no, {});
}

/** Current value of one base unit at a store: the open lots' exact average, else the item's cost. */
async function currentUnitValue(itemId: number, locationId: number, fallback: Cents): Promise<number> {
  const r = await one<{ q: number; v: number }>(
    `SELECT SUM(remaining_quantity) AS q, SUM(remaining_quantity * amount::numeric / NULLIF(quantity, 0)) AS v
     FROM item_ledger_entry WHERE item_id = ? AND location_id = ? AND open = true AND remaining_quantity > 0`, itemId, locationId);
  return Number(r?.q) > 0 ? Number(r!.v) / Number(r!.q) : Number(fallback);
}

export async function postStockCount(no: string, user: Actor): Promise<{ adjusted: number; variance: Cents; journalNo: string | null }> {
  return tx(async () => {
    const c = await one<{ id: number; status: string; location_id: number; count_date: string; created_by: string }>(
      'SELECT id, status, location_id, count_date, created_by FROM stock_count WHERE no = ? FOR UPDATE', no);
    if (!c) throw new AppError('Stock count not found', 'NOT_FOUND');
    if (c.status !== 'OPEN') throw new AppError(`This count is ${c.status.toLowerCase()}`, 'VALIDATION');
    if (c.created_by === user.username) throw new AppError('Someone other than the person who opened the count must post it', 'SEGREGATION');
    const lines = await all<{ id: number; item_id: number; item_no: string; qty_calculated: number; qty_counted: number | null; on_hand: number;
      costing_method: ItemCostingMethod; unit_cost: Cents; inventory_account: number; adjustment_account: number }>(
      `SELECT s.id, s.item_id, i.no AS item_no, s.qty_calculated, s.qty_counted, COALESCE(k.inventory, 0) AS on_hand, i.costing_method, i.unit_cost,
              ipg.inventory_gl_account_id AS inventory_account, ppg.adjustment_gl_account_id AS adjustment_account
       FROM stock_count_line s JOIN item i ON i.id = s.item_id
       JOIN inventory_posting_group ipg ON ipg.id = i.inventory_posting_group_id JOIN product_posting_group ppg ON ppg.id = i.product_posting_group_id
       LEFT JOIN stockkeeping_unit k ON k.item_id = s.item_id AND k.location_id = ?
       WHERE s.stock_count_id = ? FOR UPDATE OF s`, c.location_id, c.id);
    const uncounted = lines.filter((l) => l.qty_counted == null).length;
    if (uncounted) throw new AppError(`${uncounted} item(s) have no counted quantity — enter 0 for anything not on the shelf`, 'VALIDATION');
    const moved = lines.filter((l) => Number(l.on_hand) !== Number(l.qty_calculated)).map((l) => l.item_no);
    if (moved.length) throw new AppError(`Stock moved after the count opened (${moved.slice(0, 5).join(', ')}) — cancel and open a new count`, 'VALIDATION');

    const now = new Date().toISOString();
    const gl = new Map<string, JournalLineInput>();
    const leg = (account: number, debit: number, credit: number) => {
      const key = `${account}`;
      const cur = gl.get(key) ?? { account, debit: 0, credit: 0, narration: `Stock count ${no}` };
      cur.debit = (cur.debit ?? 0) + debit; cur.credit = (cur.credit ?? 0) + credit; gl.set(key, cur);
    };
    let variance = 0;
    let adjusted = 0;
    for (const l of lines) {
      const diff = Number(l.qty_counted) - Number(l.qty_calculated);
      if (diff === 0) { await run('UPDATE stock_count_line SET variance_amount = 0 WHERE id = ?', l.id); continue; }
      let amount: number;
      if (diff > 0) {
        // Found stock comes in at what the store's stock is currently worth.
        amount = Math.round(diff * await currentUnitValue(l.item_id, c.location_id, l.unit_cost));
        await run(`INSERT INTO item_ledger_entry (item_id, location_id, posting_date, entry_type, document_no, quantity, remaining_quantity, open, unit_cost, amount, created_at)
                   VALUES (?,?,?, 'Phys. Inventory', ?, ?, ?, true, ?, ?, ?)`, l.item_id, c.location_id, c.count_date, no, diff, diff, Math.round(amount / diff), amount, now);
        leg(l.inventory_account, amount, 0); leg(l.adjustment_account, 0, amount);
      } else {
        const costed = await costOutbound(l.item_id, c.location_id, l.costing_method, -diff, null);
        amount = -costed.amount;
        const ile = (await run(`INSERT INTO item_ledger_entry (item_id, location_id, posting_date, entry_type, document_no, quantity, remaining_quantity, open, unit_cost, amount, created_at)
                   VALUES (?,?,?, 'Phys. Inventory', ?, ?, 0, false, ?, ?, ?)`, l.item_id, c.location_id, c.count_date, no, diff, costed.unitCost, costed.amount, now)).lastInsertRowid;
        await applyOutboundLots(Number(ile), costed.applications, c.count_date);
        leg(l.adjustment_account, costed.amount, 0); leg(l.inventory_account, 0, costed.amount);
      }
      await run('UPDATE stockkeeping_unit SET inventory = ? WHERE item_id = ? AND location_id = ?', l.qty_counted, l.item_id, c.location_id);
      await run('UPDATE item SET inventory = (SELECT COALESCE(SUM(inventory), 0) FROM stockkeeping_unit WHERE item_id = ?) WHERE id = ?', l.item_id, l.item_id);
      await run('UPDATE stock_count_line SET variance_amount = ? WHERE id = ?', amount, l.id);
      variance += amount;
      adjusted++;
    }
    // Opposite legs on the same account (a gain on one item, a loss on another) net off.
    const lines2 = [...gl.values()].map((l) => {
      const net = (l.debit ?? 0) - (l.credit ?? 0);
      return { ...l, debit: Math.max(net, 0), credit: Math.max(-net, 0) };
    }).filter((l) => l.debit || l.credit);
    let journalId: number | null = null;
    let journalNo: string | null = null;
    if (lines2.length) {
      const j = await postJournal({ valueDate: c.count_date, module: 'INVENTORY', eventType: 'PHYS_INVENTORY', description: `Stock count ${no}`,
        reference: no, user, idempotencyKey: `PHC-${no}`, lines: lines2 });
      journalId = j.id; journalNo = j.journal_no;
    }
    await run("UPDATE stock_count SET status = 'POSTED', total_variance = ?, journal_id = ?, posted_at = ?, posted_by = ? WHERE id = ?",
      variance, journalId, now, user.username, c.id);
    await audit(user, 'STOCK_COUNT_POST', 'stock_count', no, { adjusted, variance, journal: journalNo });
    return { adjusted, variance, journalNo };
  }, { timeout: 300_000 });
}
