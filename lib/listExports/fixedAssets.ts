import { listFixedAssets, listFaLedgerEntries, FA_FILTER_FIELDS, FA_LEDGER_FILTER_FIELDS } from '../fixedAssets.ts';
import { listFaJournalLines, FA_JOURNAL_FILTER_FIELDS } from '../faJournal.ts';
import {
  listFaClasses, listFaSubclasses, listFaLocations, listMaintenanceCodes, listDepreciationBooks, listFaPostingGroups,
} from '../fixedAssetsSetup.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';
import type { ExcelColumn } from '../excel.ts';
import type { FaLedgerEntryView } from '../types.ts';

/* Fixed Assets setup tables load whole, so their dynamic filters run in memory
   (lib/listFilters.ts filterRows) against these allow-lists. */
export const FA_CODE_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'code', label: 'Code', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }] },
];
export const FA_SUBCLASS_FILTER_FIELDS: FilterFieldDef[] = [...FA_CODE_FILTER_FIELDS, { key: 'fa_class_code', label: 'Class', type: 'text' }];
export const FA_POSTING_GROUP_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'code', label: 'Code', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'acquisition_cost_account_code', label: 'Acquisition cost account', type: 'text' },
  { key: 'assets_using', label: 'Assets', type: 'number' },
];
export const DEPRECIATION_BOOK_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'code', label: 'Code', type: 'text' }, { key: 'description', label: 'Description', type: 'text' },
];

const codeColumns = <T extends { code: string; description: string; status?: string }>(): ExcelColumn<T>[] => [
  { header: 'Code', key: 'code', value: (r) => r.code },
  { header: 'Description', key: 'description', width: 30, value: (r) => r.description },
  { header: 'Status', key: 'status', value: (r) => r.status ?? null },
];
const ledgerColumns: ExcelColumn<FaLedgerEntryView>[] = [
  { header: 'Date', key: 'fa_posting_date', width: 12, value: (e) => e.fa_posting_date },
  { header: 'Asset no.', key: 'fixed_asset_no', value: (e) => e.fixed_asset_no },
  { header: 'Asset', key: 'fixed_asset_description', width: 28, value: (e) => e.fixed_asset_description },
  { header: 'Book', key: 'depreciation_book_code', value: (e) => e.depreciation_book_code },
  { header: 'Type', key: 'fa_posting_type', value: (e) => e.fa_posting_type },
  { header: 'Maintenance code', key: 'maintenance_code', value: (e) => e.maintenance_code },
  { header: 'Document', key: 'document_no', value: (e) => e.document_no },
  { header: 'Amount', key: 'amount', width: 14, value: (e) => money(e.amount) },
  { header: 'Days', key: 'days', width: 8, value: (e) => e.no_of_depreciation_days },
  { header: 'Part of book value', key: 'part_of_book_value', width: 10, value: (e) => (e.part_of_book_value ? 'Yes' : 'No') },
];

export const FIXED_ASSET_EXPORTS = {
  'fixed-assets': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_ASSETS',
    sheet: 'Fixed Assets', filename: 'fixed-assets.xlsx',
    fields: FA_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listFixedAssets({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (a) => a.no },
      { header: 'Description', key: 'description', width: 30, value: (a) => a.description },
      { header: 'Class', key: 'fa_class_code', value: (a) => a.fa_class_code },
      { header: 'Location', key: 'fa_location_code', value: (a) => a.fa_location_code },
      { header: 'Acquisition cost', key: 'acquisition_cost', width: 14, value: (a) => money(a.acquisition_cost) },
      { header: 'Accumulated depreciation', key: 'accumulated_depreciation', width: 14, value: (a) => money(a.accumulated_depreciation) },
      { header: 'Book value', key: 'book_value', width: 14, value: (a) => money(a.book_value) },
      { header: 'Disposed', key: 'disposed', width: 9, value: (a) => (a.disposed ? 'Yes' : 'No') },
    ],
  }),

  'fa-journal': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_JOURNAL',
    sheet: 'FA Journal', filename: 'fa-journal.xlsx',
    fields: FA_JOURNAL_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listFaJournalLines({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (l) => l.no },
      { header: 'Posting date', key: 'posting_date', width: 12, value: (l) => l.posting_date },
      { header: 'Asset no.', key: 'fixed_asset_no', value: (l) => l.fixed_asset_no },
      { header: 'Asset', key: 'fixed_asset_description', width: 28, value: (l) => l.fixed_asset_description },
      { header: 'Type', key: 'fa_posting_type', value: (l) => l.fa_posting_type },
      { header: 'Amount', key: 'amount', width: 14, value: (l) => money(l.amount) },
      { header: 'Source', key: 'source', value: (l) => l.source },
      { header: 'Status', key: 'status', value: (l) => l.status },
      { header: 'Created by', key: 'created_by', value: (l) => l.created_by },
    ],
  }),

  'fa-ledger': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_LEDGER',
    sheet: 'FA Ledger Entries', filename: 'fa-ledger-entries.xlsx',
    fields: FA_LEDGER_FILTER_FIELDS,
    rows: ({ filters }) => listFaLedgerEntries({ filters }),
    columns: ledgerColumns,
  }),

  'fa-maintenance-register': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_MAINTENANCE',
    sheet: 'Maintenance Register', filename: 'fa-maintenance-register.xlsx',
    fields: FA_LEDGER_FILTER_FIELDS,
    rows: ({ filters }) => listFaLedgerEntries({ postingType: 'Maintenance', filters }),
    columns: ledgerColumns,
  }),

  'fa-maintenance-codes': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_MAINTENANCE',
    sheet: 'Maintenance Codes', filename: 'fa-maintenance-codes.xlsx',
    fields: FA_CODE_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listMaintenanceCodes(), FA_CODE_FILTER_FIELDS, filters),
    columns: codeColumns(),
  }),

  'fa-classes': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_CLASSES',
    sheet: 'FA Classes', filename: 'fa-classes.xlsx',
    fields: FA_CODE_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listFaClasses(), FA_CODE_FILTER_FIELDS, filters),
    columns: codeColumns(),
  }),

  'fa-subclasses': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_CLASSES',
    sheet: 'FA Subclasses', filename: 'fa-subclasses.xlsx',
    fields: FA_SUBCLASS_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listFaSubclasses(), FA_SUBCLASS_FILTER_FIELDS, filters),
    columns: [...codeColumns(), { header: 'Class', key: 'fa_class_code', value: (s) => s.fa_class_code }],
  }),

  'fa-locations': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_LOCATIONS',
    sheet: 'FA Locations', filename: 'fa-locations.xlsx',
    fields: FA_CODE_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listFaLocations(), FA_CODE_FILTER_FIELDS, filters),
    columns: codeColumns(),
  }),

  'fa-posting-groups': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_POSTING_GROUPS',
    sheet: 'FA Posting Groups', filename: 'fa-posting-groups.xlsx',
    fields: FA_POSTING_GROUP_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listFaPostingGroups(), FA_POSTING_GROUP_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (g) => g.code },
      { header: 'Description', key: 'description', width: 28, value: (g) => g.description },
      { header: 'Acquisition cost', key: 'acq', value: (g) => g.acquisition_cost_account_code },
      { header: 'Accum. depreciation', key: 'accum', value: (g) => g.accum_depreciation_account_code },
      { header: 'Depreciation expense', key: 'dep', value: (g) => g.depreciation_expense_account_code },
      { header: 'Maintenance expense', key: 'maint', value: (g) => g.maintenance_expense_account_code },
      { header: 'Gains on disposal', key: 'gains', value: (g) => g.gains_acc_on_disposal_code },
      { header: 'Losses on disposal', key: 'losses', value: (g) => g.losses_acc_on_disposal_code },
      { header: 'Assets', key: 'assets_using', width: 8, value: (g) => g.assets_using },
    ],
  }),

  'depreciation-books': defineExport({
    action: 'FIXED_ASSETS_READ', page: 'FA_BOOKS',
    sheet: 'Depreciation Books', filename: 'depreciation-books.xlsx',
    fields: DEPRECIATION_BOOK_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listDepreciationBooks(), DEPRECIATION_BOOK_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (b) => b.code },
      { header: 'Description', key: 'description', width: 28, value: (b) => b.description },
      { header: 'Final rounding', key: 'rounding', width: 12, value: (b) => money(b.default_final_rounding_amount) },
    ],
  }),
};
