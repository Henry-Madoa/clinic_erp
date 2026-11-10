import { listCustomers, getCustomerLedgerEntries, CUSTOMER_FILTER_FIELDS, CUSTOMER_LEDGER_FILTER_FIELDS } from '../customers.ts';
import {
  listSalesDocuments, listPostedSalesDocuments, SALES_DOC_FILTER_FIELDS, SALES_DOC_VIEWS, POSTED_SALES_FILTER_FIELDS, type SalesDocView,
} from '../salesDocuments.ts';
import { listReminders } from '../reminders.ts';
import { listReminderTerms, listFinanceChargeTerms } from '../receivablesSetup.ts';
import { listVendors, getVendorLedgerEntries, VENDOR_FILTER_FIELDS, VENDOR_LEDGER_FILTER_FIELDS } from '../vendors.ts';
import {
  listPurchaseDocuments, listPostedPurchaseDocuments, PURCHASE_DOC_FILTER_FIELDS, PURCHASE_DOC_VIEWS, POSTED_PURCHASE_FILTER_FIELDS,
  type PurchaseDocView,
} from '../purchaseDocuments.ts';
import { filterRows, type FilterFieldDef } from '../listFilters.ts';
import { defineExport, money } from '../listExport.ts';
import type { CustLedgerEntryView, VendorLedgerEntryView, PostedPurchaseDocumentType, PostedSalesDocumentType, PurchaseDocumentType, SalesDocumentType } from '../types.ts';

/* Reminders and the reminder / finance-charge terms load whole, so their dynamic filters run in
   memory (lib/listFilters.ts filterRows) against these allow-lists. */
export const REMINDER_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'no', label: 'No.', type: 'text' },
  { key: 'customer_no', label: 'Customer no.', type: 'text' },
  { key: 'reminder_level', label: 'Level', type: 'number' },
  { key: 'remaining_amount', label: 'Overdue', type: 'number', cents: true },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Open', label: 'Open' }, { value: 'Issued', label: 'Issued' }] },
];
export const REMINDER_TERMS_FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'code', label: 'Code', type: 'text' }, { key: 'description', label: 'Description', type: 'text' },
];
export const FINANCE_CHARGE_TERMS_FILTER_FIELDS: FilterFieldDef[] = [
  ...REMINDER_TERMS_FILTER_FIELDS, { key: 'interest_rate', label: 'Rate % p.a.', type: 'number' },
];

/** Each document type is a tab of its own, gated by its own page. */
const SALES_TYPE_PAGE: Record<SalesDocumentType, string> = {
  Quote: 'RECEIVABLES_QUOTES', Order: 'RECEIVABLES_ORDERS', Invoice: 'RECEIVABLES_SALES_INVOICES', 'Credit Memo': 'RECEIVABLES_CREDIT_MEMOS',
};
const PURCHASE_TYPE_PAGE: Record<PurchaseDocumentType, string> = {
  Quote: 'PAYABLES_QUOTES', Order: 'PAYABLES_ORDERS', Invoice: 'PAYABLES_PURCHASE_INVOICES', 'Credit Memo': 'PAYABLES_CREDIT_MEMOS',
};
const salesType = (t: string | null): SalesDocumentType => (t && t in SALES_TYPE_PAGE ? t : 'Invoice') as SalesDocumentType;
const purchaseType = (t: string | null): PurchaseDocumentType => (t && t in PURCHASE_TYPE_PAGE ? t : 'Invoice') as PurchaseDocumentType;
const postedSalesType = (t: string | null): PostedSalesDocumentType =>
  (['Shipment', 'Invoice', 'Credit Memo'].includes(t ?? '') ? t : 'Invoice') as PostedSalesDocumentType;
const postedPurchaseType = (t: string | null): PostedPurchaseDocumentType =>
  (['Receipt', 'Invoice', 'Credit Memo'].includes(t ?? '') ? t : 'Invoice') as PostedPurchaseDocumentType;

const ledgerColumns = <T extends { posting_date: string; document_type: string | null; document_no: string | null; due_date: string | null; amount: number; remaining_amount: number; open: number | boolean }>() => [
  { header: 'Date', key: 'posting_date', width: 12, value: (e: T) => e.posting_date },
  { header: 'Type', key: 'document_type', value: (e: T) => e.document_type },
  { header: 'Document', key: 'document_no', value: (e: T) => e.document_no },
  { header: 'Due', key: 'due_date', width: 12, value: (e: T) => e.due_date },
  { header: 'Amount', key: 'amount', width: 14, value: (e: T) => money(e.amount) },
  { header: 'Remaining', key: 'remaining_amount', width: 14, value: (e: T) => money(e.remaining_amount) },
  { header: 'Open', key: 'open', width: 8, value: (e: T) => (e.open ? 'Yes' : 'No') },
];

export const RECEIVABLES_PAYABLES_EXPORTS = {
  customers: defineExport({
    action: 'RECEIVABLES_READ', page: 'RECEIVABLES_CUSTOMERS',
    sheet: 'Customers', filename: 'customers.xlsx',
    fields: CUSTOMER_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listCustomers({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (c) => c.no },
      { header: 'Name', key: 'name', width: 28, value: (c) => c.name },
      { header: 'City', key: 'city', value: (c) => c.city },
      { header: 'Posting group', key: 'pg', value: (c) => c.customer_posting_group_code },
      { header: 'Payment terms', key: 'payment_terms_code', value: (c) => c.payment_terms_code },
      { header: 'Balance', key: 'balance', width: 14, value: (c) => money(c.balance) },
      { header: 'Balance due', key: 'balance_due', width: 14, value: (c) => money(c.balance_due) },
      { header: 'Blocked', key: 'blocked', value: (c) => c.blocked || null },
    ],
  }),

  'sales-documents': defineExport({
    action: 'RECEIVABLES_READ',
    page: ({ params }) => SALES_TYPE_PAGE[salesType(params.get('type'))],
    sheet: 'Sales Documents', filename: 'sales-documents.xlsx',
    fields: SALES_DOC_FILTER_FIELDS,
    rows: ({ view, q, filters, sort, params }) => listSalesDocuments({
      documentType: salesType(params.get('type')), view: (SALES_DOC_VIEWS.includes(view as SalesDocView) ? view : 'all') as SalesDocView,
      search: q, filters, sort,
    }),
    columns: [
      { header: 'No.', key: 'no', value: (d) => d.no },
      { header: 'Type', key: 'document_type', value: (d) => d.document_type },
      { header: 'Customer no.', key: 'customer_no', value: (d) => d.customer_no },
      { header: 'Customer', key: 'customer_name', width: 28, value: (d) => d.customer_name },
      { header: 'Posting date', key: 'posting_date', width: 12, value: (d) => d.posting_date },
      { header: 'Due date', key: 'due_date', width: 12, value: (d) => d.due_date },
      { header: 'Amount', key: 'amount', width: 14, value: (d) => money(d.amount) },
      { header: 'Status', key: 'status', value: (d) => d.status },
      { header: 'Created by', key: 'created_by', value: (d) => d.created_by },
    ],
  }),

  'posted-sales-documents': defineExport({
    action: 'RECEIVABLES_READ', page: 'RECEIVABLES_POSTED',
    sheet: 'Posted Sales Documents', filename: 'posted-sales-documents.xlsx',
    fields: POSTED_SALES_FILTER_FIELDS,
    rows: ({ q, filters, params }) => listPostedSalesDocuments(postedSalesType(params.get('type')), q, filters),
    columns: [
      { header: 'No.', key: 'no', value: (d) => d.no },
      { header: 'Customer no.', key: 'customer_no', value: (d) => d.customer_no },
      { header: 'Customer', key: 'customer_name', width: 28, value: (d) => d.customer_name },
      { header: 'Order', key: 'order_no', value: (d) => d.order_no },
      { header: 'Date', key: 'posting_date', width: 12, value: (d) => d.posting_date },
      { header: 'Amount', key: 'amount', width: 14, value: (d) => money(d.amount) },
    ],
  }),

  reminders: defineExport({
    action: 'RECEIVABLES_READ',
    page: ({ params }) => (params.get('type') === 'Finance Charge Memo' ? 'RECEIVABLES_FINANCE_CHARGES' : 'RECEIVABLES_REMINDERS'),
    sheet: 'Reminders', filename: 'reminders.xlsx',
    fields: REMINDER_FILTER_FIELDS,
    rows: async ({ q, filters, params }) => filterRows(
      await listReminders({ documentType: params.get('type') === 'Finance Charge Memo' ? 'Finance Charge Memo' : 'Reminder', search: q }),
      REMINDER_FILTER_FIELDS, filters,
    ),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Type', key: 'document_type', value: (r) => r.document_type },
      { header: 'Customer no.', key: 'customer_no', value: (r) => r.customer_no },
      { header: 'Customer', key: 'customer_name', width: 28, value: (r) => r.customer_name },
      { header: 'Level', key: 'reminder_level', width: 8, value: (r) => r.reminder_level },
      { header: 'Overdue', key: 'remaining_amount', width: 14, value: (r) => money(r.remaining_amount) },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),

  'customer-ledger': defineExport<CustLedgerEntryView>({
    action: 'RECEIVABLES_READ', page: 'RECEIVABLES_LEDGER',
    sheet: 'Cust. Ledger Entries', filename: 'customer-ledger-entries.xlsx',
    fields: CUSTOMER_LEDGER_FILTER_FIELDS,
    rows: ({ filters }) => getCustomerLedgerEntries({ filters }),
    columns: [
      { header: 'Customer no.', key: 'customer_no', value: (e) => e.customer_no },
      { header: 'Customer', key: 'customer_name', width: 28, value: (e) => e.customer_name },
      ...ledgerColumns<CustLedgerEntryView>(),
    ],
  }),

  'reminder-terms': defineExport({
    action: 'RECEIVABLES_READ', page: 'RECEIVABLES_REMINDER_TERMS',
    sheet: 'Reminder Terms', filename: 'reminder-terms.xlsx',
    fields: REMINDER_TERMS_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listReminderTerms(), REMINDER_TERMS_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (t) => t.code },
      { header: 'Description', key: 'description', width: 28, value: (t) => t.description },
      { header: 'Max reminders', key: 'max', width: 10, value: (t) => t.max_no_of_reminders },
      { header: 'Post interest', key: 'post_interest', width: 10, value: (t) => (t.post_interest ? 'Yes' : 'No') },
      { header: 'Post fee', key: 'post_additional_fee', width: 10, value: (t) => (t.post_additional_fee ? 'Yes' : 'No') },
    ],
  }),

  'finance-charge-terms': defineExport({
    action: 'RECEIVABLES_READ', page: 'RECEIVABLES_REMINDER_TERMS',
    sheet: 'Finance Charge Terms', filename: 'finance-charge-terms.xlsx',
    fields: FINANCE_CHARGE_TERMS_FILTER_FIELDS,
    rows: async ({ filters }) => filterRows(await listFinanceChargeTerms(), FINANCE_CHARGE_TERMS_FILTER_FIELDS, filters),
    columns: [
      { header: 'Code', key: 'code', value: (t) => t.code },
      { header: 'Description', key: 'description', width: 28, value: (t) => t.description },
      { header: 'Rate % p.a.', key: 'interest_rate', width: 10, value: (t) => Number(t.interest_rate) },
      { header: 'Min amount', key: 'min_amount', width: 12, value: (t) => money(t.min_amount) },
      { header: 'Post interest', key: 'post_interest', width: 10, value: (t) => (t.post_interest ? 'Yes' : 'No') },
    ],
  }),

  vendors: defineExport({
    action: 'PAYABLES_READ', page: 'PAYABLES_VENDORS',
    sheet: 'Vendors', filename: 'vendors.xlsx',
    fields: VENDOR_FILTER_FIELDS,
    rows: ({ q, filters, sort }) => listVendors({ search: q, filters, sort }),
    columns: [
      { header: 'No.', key: 'no', value: (v) => v.no },
      { header: 'Name', key: 'name', width: 28, value: (v) => v.name },
      { header: 'City', key: 'city', value: (v) => v.city },
      { header: 'Posting group', key: 'pg', value: (v) => v.vendor_posting_group_code },
      { header: 'Payment terms', key: 'payment_terms_code', value: (v) => v.payment_terms_code },
      { header: 'Balance', key: 'balance', width: 14, value: (v) => money(v.balance) },
      { header: 'Balance due', key: 'balance_due', width: 14, value: (v) => money(v.balance_due) },
      { header: 'Blocked', key: 'blocked', value: (v) => v.blocked || null },
    ],
  }),

  'purchase-documents': defineExport({
    action: 'PAYABLES_READ',
    page: ({ params }) => PURCHASE_TYPE_PAGE[purchaseType(params.get('type'))],
    sheet: 'Purchase Documents', filename: 'purchase-documents.xlsx',
    fields: PURCHASE_DOC_FILTER_FIELDS,
    rows: ({ view, q, filters, sort, params }) => listPurchaseDocuments({
      documentType: purchaseType(params.get('type')), view: (PURCHASE_DOC_VIEWS.includes(view as PurchaseDocView) ? view : 'all') as PurchaseDocView,
      search: q, filters, sort,
    }),
    columns: [
      { header: 'No.', key: 'no', value: (d) => d.no },
      { header: 'Type', key: 'document_type', value: (d) => d.document_type },
      { header: 'Vendor no.', key: 'vendor_no', value: (d) => d.vendor_no },
      { header: 'Vendor', key: 'vendor_name', width: 28, value: (d) => d.vendor_name },
      { header: 'Vendor invoice', key: 'vendor_invoice_no', value: (d) => d.vendor_invoice_no },
      { header: 'Posting date', key: 'posting_date', width: 12, value: (d) => d.posting_date },
      { header: 'Due date', key: 'due_date', width: 12, value: (d) => d.due_date },
      { header: 'Amount', key: 'amount', width: 14, value: (d) => money(d.amount) },
      { header: 'Status', key: 'status', value: (d) => d.status },
      { header: 'Created by', key: 'created_by', value: (d) => d.created_by },
    ],
  }),

  'posted-purchase-documents': defineExport({
    action: 'PAYABLES_READ', page: 'PAYABLES_POSTED',
    sheet: 'Posted Purchase Documents', filename: 'posted-purchase-documents.xlsx',
    fields: POSTED_PURCHASE_FILTER_FIELDS,
    rows: ({ q, filters, params }) => listPostedPurchaseDocuments(postedPurchaseType(params.get('type')), q, filters),
    columns: [
      { header: 'No.', key: 'no', value: (d) => d.no },
      { header: 'Vendor no.', key: 'vendor_no', value: (d) => d.vendor_no },
      { header: 'Vendor', key: 'vendor_name', width: 28, value: (d) => d.vendor_name },
      { header: 'Vendor invoice', key: 'vendor_invoice_no', value: (d) => d.vendor_invoice_no },
      { header: 'Order', key: 'order_no', value: (d) => d.order_no },
      { header: 'Date', key: 'posting_date', width: 12, value: (d) => d.posting_date },
      { header: 'Amount', key: 'amount', width: 14, value: (d) => money(d.amount) },
    ],
  }),

  'vendor-ledger': defineExport<VendorLedgerEntryView>({
    action: 'PAYABLES_READ', page: 'PAYABLES_LEDGER',
    sheet: 'Vendor Ledger Entries', filename: 'vendor-ledger-entries.xlsx',
    fields: VENDOR_LEDGER_FILTER_FIELDS,
    rows: ({ filters }) => getVendorLedgerEntries({ filters }),
    columns: [
      { header: 'Vendor no.', key: 'vendor_no', value: (e) => e.vendor_no },
      { header: 'Vendor', key: 'vendor_name', width: 28, value: (e) => e.vendor_name },
      ...ledgerColumns<VendorLedgerEntryView>(),
    ],
  }),
};
