import { listBankAccounts, listBankReconciliations } from '../bankMgmt.ts';
import { listCurrencies, listExchangeRates, listBankAccPostingGroups, listExternalBanks } from '../cashMgmtSetup.ts';
import { listReceipts, RECEIPT_FILTER_FIELDS } from '../receipts.ts';
import { listPaymentVouchers, PV_FILTER_FIELDS } from '../paymentVouchers.ts';
import { listTillClosings, TILL_CLOSING_FILTER_FIELDS, type TillClosingListView } from '../tillClosings.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';
import { humanise } from '../format.ts';

/* Cash Management's setup tables and reconciliations load whole, so their dynamic filters run
   in memory (lib/listFilters.ts filterRows) against these allow-lists. */
const CODE: FilterFieldDef = { key: 'code', label: 'Code', type: 'text' };
export const BANK_ACCOUNT_FILTER_FIELDS: FilterFieldDef[] = [
  CODE,
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'currency_code', label: 'Currency', type: 'text' },
  { key: 'bank_acc_posting_group_code', label: 'Posting group', type: 'text' },
  { key: 'balance_lcy', label: 'Balance (LCY)', type: 'number', cents: true },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }] },
];
export const RECONCILIATION_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'statement_no', label: 'Statement no.', type: 'text' },
  { key: 'bank_account_code', label: 'Bank', type: 'text' },
  { key: 'statement_date', label: 'Date', type: 'date' },
  { key: 'statement_balance', label: 'Ending balance', type: 'number', cents: true },
  { key: 'status', label: 'Status', type: 'text' },
];
export const CURRENCY_FILTER_FIELDS: FilterFieldDef[] = [CODE, { key: 'description', label: 'Description', type: 'text' }];
export const EXCHANGE_RATE_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'currency_code', label: 'Currency', type: 'text' },
  { key: 'starting_date', label: 'Starting date', type: 'date' },
];
export const BANK_POSTING_GROUP_FILTER_FIELDS: FilterFieldDef[] = [
  CODE, { key: 'description', label: 'Description', type: 'text' }, { key: 'gl_account_code', label: 'Control account', type: 'text' },
];
export const EXTERNAL_BANK_FILTER_FIELDS: FilterFieldDef[] = [CODE, { key: 'name', label: 'Name', type: 'text' }];

export const CASH_MANAGEMENT_EXPORTS = {
  'bank-accounts': defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_BANK_ACCOUNTS',
    sheet: 'Bank Accounts', filename: 'bank-accounts.xlsx',
    fields: BANK_ACCOUNT_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listBankAccounts(), BANK_ACCOUNT_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (b) => b.code },
      { header: 'Name', key: 'name', width: 28, value: (b) => b.name },
      { header: 'Currency', key: 'currency_code', width: 10, value: (b) => b.currency_code },
      { header: 'Posting group', key: 'posting_group', value: (b) => b.bank_acc_posting_group_code },
      { header: 'Control account', key: 'gl_account_code', value: (b) => b.gl_account_code },
      { header: 'Balance', key: 'balance', width: 14, value: (b) => money(b.balance) },
      { header: 'Balance (LCY)', key: 'balance_lcy', width: 14, value: (b) => money(b.balance_lcy) },
      { header: 'Status', key: 'status', value: (b) => humanise(b.status) },
    ],
  }),

  reconciliations: defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_RECONCILIATIONS',
    sheet: 'Bank Reconciliations', filename: 'bank-reconciliations.xlsx',
    fields: RECONCILIATION_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listBankReconciliations(), RECONCILIATION_FILTER_FIELDS, filters),
    columns: [
      { header: 'Statement no.', key: 'statement_no', value: (r) => r.statement_no },
      { header: 'Bank', key: 'bank_account_code', value: (r) => r.bank_account_code },
      { header: 'Date', key: 'statement_date', width: 12, value: (r) => r.statement_date },
      { header: 'Ending balance', key: 'statement_balance', width: 14, value: (r) => money(r.statement_balance) },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  receipts: defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_RECEIPTS',
    sheet: 'Receipts', filename: 'receipts.xlsx',
    fields: RECEIPT_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listReceipts({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Date', key: 'posting_date', width: 12, value: (r) => r.posting_date },
      { header: 'Type', key: 'receipt_type', value: (r) => r.receipt_type },
      { header: 'Bank', key: 'bank_account_code', value: (r) => r.bank_account_code },
      { header: 'Received from', key: 'description', width: 30, value: (r) => r.description },
      { header: 'Currency', key: 'currency_code', width: 10, value: (r) => r.currency_code },
      { header: 'Amount', key: 'amount', width: 14, value: (r) => money(r.amount) },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Posted', key: 'posted', width: 8, value: (r) => (r.posted ? 'Yes' : 'No') },
    ],
  }),

  'payment-vouchers': defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_PAYMENT_VOUCHERS',
    sheet: 'Payment Vouchers', filename: 'payment-vouchers.xlsx',
    fields: PV_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listPaymentVouchers({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Date', key: 'date', width: 12, value: (r) => r.date },
      { header: 'Payment type', key: 'pv_type', value: (r) => r.pv_type },
      { header: 'Paying bank', key: 'paying_bank_account_code', value: (r) => r.paying_bank_account_code },
      { header: 'Payee', key: 'payee_name', width: 28, value: (r) => r.payee_name },
      { header: 'Cheque', key: 'cheque_no', value: (r) => r.cheque_no },
      { header: 'Currency', key: 'currency_code', width: 10, value: (r) => r.currency_code },
      { header: 'Net paid', key: 'total_amount', width: 14, value: (r) => money(r.total_amount) },
      { header: 'Status', key: 'status', value: (r) => r.status },
      { header: 'Posted', key: 'posted', width: 8, value: (r) => (r.posted ? 'Yes' : 'No') },
    ],
  }),

  currencies: defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_CURRENCIES',
    sheet: 'Currencies', filename: 'currencies.xlsx',
    fields: CURRENCY_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listCurrencies(), CURRENCY_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (c) => c.code },
      { header: 'Description', key: 'description', width: 26, value: (c) => c.description },
      { header: 'Base', key: 'is_base', width: 8, value: (c) => (c.is_base ? 'Yes' : 'No') },
      { header: 'Latest rate', key: 'latest_rate', width: 12, value: (c) => (c.latest_rate == null ? null : Number(c.latest_rate)) },
      { header: 'Rates', key: 'rate_count', width: 8, value: (c) => c.rate_count },
      { header: 'Blocked', key: 'blocked', width: 8, value: (c) => (c.blocked ? 'Yes' : 'No') },
    ],
  }),

  'exchange-rates': defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_EXCHANGE_RATES',
    sheet: 'Exchange Rates', filename: 'exchange-rates.xlsx',
    fields: EXCHANGE_RATE_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listExchangeRates(), EXCHANGE_RATE_FILTER_FIELDS, filters),
    columns: [
      { header: 'Currency', key: 'currency_code', value: (r) => r.currency_code },
      { header: 'Starting date', key: 'starting_date', width: 12, value: (r) => r.starting_date },
      { header: 'Units', key: 'units', width: 10, value: (r) => Number(r.exchange_rate_amount) },
      { header: 'Relational (LCY)', key: 'relational', width: 14, value: (r) => Number(r.relational_exch_rate_amount) },
      { header: 'Factor', key: 'factor', width: 12, value: (r) => Number(r.relational_exch_rate_amount) / Number(r.exchange_rate_amount) },
    ],
  }),

  'bank-posting-groups': defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_POSTING_GROUPS',
    sheet: 'Bank Posting Groups', filename: 'bank-posting-groups.xlsx',
    fields: BANK_POSTING_GROUP_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listBankAccPostingGroups(), BANK_POSTING_GROUP_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (g) => g.code },
      { header: 'Description', key: 'description', width: 26, value: (g) => g.description },
      { header: 'Control account', key: 'gl_account_code', value: (g) => g.gl_account_code },
      { header: 'Control account name', key: 'gl_account_name', width: 26, value: (g) => g.gl_account_name },
      { header: 'Accounts', key: 'accounts_using', width: 10, value: (g) => g.accounts_using },
    ],
  }),

  'external-banks': defineExport({
    action: 'CASH_MGMT_READ', page: 'CASH_MGMT_EXTERNAL_BANKS',
    sheet: 'External Banks', filename: 'external-banks.xlsx',
    fields: EXTERNAL_BANK_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listExternalBanks(), EXTERNAL_BANK_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (b) => b.code },
      { header: 'Name', key: 'name', width: 30, value: (b) => b.name },
      { header: 'Branches', key: 'branch_count', width: 10, value: (b) => b.branch_count },
    ],
  }),

  'till-closings': defineExport({
    action: 'TILL_CLOSINGS_READ',
    sheet: 'Till Closings', filename: 'till-closings.xlsx',
    fields: TILL_CLOSING_FILTER_FIELDS,
    rows: ({ view, q, filters, sort }) => listTillClosings({
      view: (['open', 'pending', 'approved', 'posted'].includes(view) ? view : 'open') as TillClosingListView, search: q, filters, sort,
    }),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Day', key: 'closing_date', width: 12, value: (r) => r.closing_date },
      { header: 'Till', key: 'till_code', value: (r) => r.till_code },
      { header: 'Till name', key: 'till_name', width: 22, value: (r) => r.till_name },
      { header: 'Cashier', key: 'cashier', value: (r) => r.cashier_username },
      { header: 'System', key: 'system_balance', width: 14, value: (r) => money(r.system_balance) },
      { header: 'Counted', key: 'counted_amount', width: 14, value: (r) => money(r.counted_amount) },
      { header: 'Variance', key: 'variance', width: 14, value: (r) => money(r.variance) },
      { header: 'Handed over', key: 'returned_amount', width: 14, value: (r) => money(r.returned_amount) },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),
};
