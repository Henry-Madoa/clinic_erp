import { listItems, ITEM_FILTER_FIELDS } from '../items.ts';
import {
  listItemJournalLines, listItemLedgerEntries, calculateReplenishment,
  ITEM_JOURNAL_FILTER_FIELDS, ITEM_LEDGER_FILTER_FIELDS, REORDER_FILTER_FIELDS,
} from '../itemJournal.ts';
import {
  listLocations, listUnitsOfMeasure, listInventoryPostingGroups, listProductPostingGroups,
  LOCATION_FILTER_FIELDS, UNIT_OF_MEASURE_FILTER_FIELDS, INVENTORY_POSTING_GROUP_FILTER_FIELDS, PRODUCT_POSTING_GROUP_FILTER_FIELDS,
} from '../inventorySetup.ts';
import { listStockCounts, STOCK_COUNT_FILTER_FIELDS } from '../stockCount.ts';
import { filterRows } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';
import { humanise } from '../format.ts';

export const INVENTORY_EXPORTS = {
  items: defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_ITEMS',
    sheet: 'Items', filename: 'items.xlsx',
    fields: ITEM_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listItems({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (i) => i.no },
      { header: 'Description', key: 'description', width: 32, value: (i) => i.description },
      { header: 'Base UoM', key: 'uom', width: 10, value: (i) => i.base_unit_of_measure_code },
      { header: 'Costing method', key: 'costing_method', value: (i) => i.costing_method },
      { header: 'Inventory posting group', key: 'ipg', value: (i) => i.inventory_posting_group_code },
      { header: 'Product posting group', key: 'ppg', value: (i) => i.product_posting_group_code },
      { header: 'On hand', key: 'inventory', width: 10, value: (i) => i.inventory },
      { header: 'Unit cost', key: 'unit_cost', width: 12, value: (i) => money(i.unit_cost) },
      { header: 'Unit price', key: 'unit_price', width: 12, value: (i) => money(i.unit_price) },
      { header: 'Reorder point', key: 'reorder_point', width: 10, value: (i) => i.reorder_point },
      { header: 'Below reorder point', key: 'below', width: 10, value: (i) => (i.below_reorder_point ? 'Yes' : 'No') },
      { header: 'Status', key: 'status', value: (i) => humanise(i.status) },
    ],
  }),

  'item-journal': defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_ITEM_JOURNAL',
    sheet: 'Item Journal', filename: 'item-journal.xlsx',
    fields: ITEM_JOURNAL_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listItemJournalLines({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (l) => l.no },
      { header: 'Entry type', key: 'entry_type', value: (l) => l.entry_type },
      { header: 'Item no.', key: 'item_no', value: (l) => l.item_no },
      { header: 'Item', key: 'item_description', width: 28, value: (l) => l.item_description },
      { header: 'Location', key: 'location_code', width: 10, value: (l) => l.location_code },
      { header: 'New location', key: 'new_location_code', width: 10, value: (l) => l.new_location_code },
      { header: 'Quantity (base)', key: 'base_quantity', width: 10, value: (l) => l.base_quantity },
      { header: 'Amount', key: 'amount', width: 12, value: (l) => money(l.amount) },
      { header: 'Posting date', key: 'posting_date', width: 12, value: (l) => l.posting_date },
      { header: 'Status', key: 'status', value: (l) => l.status },
      { header: 'Created by', key: 'created_by', value: (l) => l.created_by },
    ],
  }),

  'stock-counts': defineExport({
    action: 'INVENTORY_READ', alsoRequires: ['STOCK_COUNT_READ'], page: 'INVENTORY_STOCK_COUNT',
    sheet: 'Stock Counts', filename: 'stock-counts.xlsx',
    fields: STOCK_COUNT_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listStockCounts(), STOCK_COUNT_FILTER_FIELDS, filters),
    columns: [
      { header: 'No.', key: 'no', value: (c) => c.no },
      { header: 'Store', key: 'location_code', width: 10, value: (c) => c.location_code },
      { header: 'Date', key: 'count_date', width: 12, value: (c) => c.count_date },
      { header: 'Status', key: 'status', value: (c) => humanise(c.status) },
      { header: 'Lines counted', key: 'lines_counted', width: 10, value: (c) => c.lines_counted ?? null },
      { header: 'Lines', key: 'lines_total', width: 8, value: (c) => c.lines_total ?? null },
      { header: 'Variance', key: 'total_variance', width: 12, value: (c) => (c.status === 'POSTED' ? money(c.total_variance) : null) },
      { header: 'Journal', key: 'journal_no', value: (c) => c.journal_no },
      { header: 'Opened by', key: 'created_by', value: (c) => c.created_by },
      { header: 'Opened at', key: 'created_at', value: (c) => c.created_at },
      { header: 'Posted by', key: 'posted_by', value: (c) => c.posted_by },
      { header: 'Posted at', key: 'posted_at', value: (c) => c.posted_at },
    ],
  }),

  'item-ledger': defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_LEDGER',
    sheet: 'Item Ledger Entries', filename: 'item-ledger-entries.xlsx',
    fields: ITEM_LEDGER_FILTER_FIELDS,
    rows: ({ filters }) => listItemLedgerEntries({ filters }),
    columns: [
      { header: 'Document', key: 'document_no', value: (e) => e.document_no },
      { header: 'Date', key: 'posting_date', width: 12, value: (e) => e.posting_date },
      { header: 'Type', key: 'entry_type', value: (e) => e.entry_type },
      { header: 'Item no.', key: 'item_no', value: (e) => e.item_no },
      { header: 'Item', key: 'item_description', width: 28, value: (e) => e.item_description },
      { header: 'Location', key: 'location_code', width: 10, value: (e) => e.location_code },
      { header: 'Quantity', key: 'quantity', width: 10, value: (e) => e.quantity },
      { header: 'Unit cost', key: 'unit_cost', width: 12, value: (e) => money(e.unit_cost) },
      { header: 'Amount', key: 'amount', width: 12, value: (e) => money(e.amount) },
      { header: 'Remaining', key: 'remaining_quantity', width: 10, value: (e) => (e.open ? e.remaining_quantity : null) },
    ],
  }),

  'reorder-suggestions': defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_REORDER',
    sheet: 'Reorder Suggestions', filename: 'reorder-suggestions.xlsx',
    fields: REORDER_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await calculateReplenishment(), REORDER_FILTER_FIELDS, filters),
    columns: [
      { header: 'Item no.', key: 'item_no', value: (s) => s.item_no },
      { header: 'Item', key: 'item_description', width: 28, value: (s) => s.item_description },
      { header: 'Location', key: 'location_code', width: 10, value: (s) => s.location_code },
      { header: 'Policy', key: 'reordering_policy', value: (s) => s.reordering_policy },
      { header: 'On hand', key: 'inventory', width: 10, value: (s) => s.inventory },
      { header: 'Reorder point', key: 'reorder_point', width: 10, value: (s) => s.reorder_point },
      { header: 'Suggested qty', key: 'suggested_quantity', width: 10, value: (s) => s.suggested_quantity },
    ],
  }),

  locations: defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_LOCATIONS',
    sheet: 'Locations', filename: 'locations.xlsx',
    fields: LOCATION_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listLocations(), LOCATION_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (l) => l.code },
      { header: 'Name', key: 'name', width: 26, value: (l) => l.name },
      { header: 'Address', key: 'address', width: 30, value: (l) => l.address },
      { header: 'Status', key: 'status', value: (l) => humanise(l.status) },
    ],
  }),

  'units-of-measure': defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_UNITS',
    sheet: 'Units of Measure', filename: 'units-of-measure.xlsx',
    fields: UNIT_OF_MEASURE_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listUnitsOfMeasure(), UNIT_OF_MEASURE_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (u) => u.code },
      { header: 'Description', key: 'description', width: 26, value: (u) => u.description },
      { header: 'Symbol', key: 'symbol', width: 8, value: (u) => u.symbol },
    ],
  }),

  'inventory-posting-groups': defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_POSTING_GROUPS',
    sheet: 'Inventory Posting Groups', filename: 'inventory-posting-groups.xlsx',
    fields: INVENTORY_POSTING_GROUP_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listInventoryPostingGroups(), INVENTORY_POSTING_GROUP_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (g) => g.code },
      { header: 'Description', key: 'description', width: 26, value: (g) => g.description },
      { header: 'G/L account', key: 'acc', value: (g) => g.inventory_gl_account_code },
      { header: 'G/L account name', key: 'acc_name', width: 26, value: (g) => g.inventory_gl_account_name },
      { header: 'Items', key: 'items_using', width: 8, value: (g) => g.items_using },
    ],
  }),

  'product-posting-groups': defineExport({
    action: 'INVENTORY_READ', page: 'INVENTORY_POSTING_GROUPS',
    sheet: 'Product Posting Groups', filename: 'product-posting-groups.xlsx',
    fields: PRODUCT_POSTING_GROUP_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listProductPostingGroups(), PRODUCT_POSTING_GROUP_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (g) => g.code },
      { header: 'Description', key: 'description', width: 26, value: (g) => g.description },
      { header: 'G/L account', key: 'acc', value: (g) => g.adjustment_gl_account_code },
      { header: 'G/L account name', key: 'acc_name', width: 26, value: (g) => g.adjustment_gl_account_name },
      { header: 'Items', key: 'items_using', width: 8, value: (g) => g.items_using },
    ],
  }),
};
