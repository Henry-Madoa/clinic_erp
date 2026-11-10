/*
 * Domain vocabulary shared by server and client code.
 *
 * These lists populate <select> options, so client components import them. They
 * must therefore stay free of any database import: pulling a constant out of a
 * service module drags the database client into the browser bundle, and the
 * build fails on its `require('fs')`.
 */
import type {
  BankAccountType, DocumentStatus, CashTransferType, GlAccountStructureType, GlAccountType, JobQueueStatus,
  JobQueueType, PayMode, UserStatus,
} from './types.ts';

export const TITLES = ['', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];
export const GENDERS = ['', 'MALE', 'FEMALE'];
export const MARITAL_STATUSES = ['', 'SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'];

/** Relationship options for next-of-kin, beneficiary and dependant records. */
export const RELATIONSHIPS = [
  '', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Nephew', 'Niece', 'Guardian', 'Other',
];

/** How a payment was actually made — shown alongside the Bank/Cashbook picker, not instead of it. */
export const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'BANK', label: 'Bank Transfer' },
  { value: 'EFT', label: 'EFT' },
  { value: 'CHEQUE', label: 'Cheque' },
];

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'];

export const JOB_QUEUE_TYPES: { value: JobQueueType; label: string }[] = [
  { value: 'APPOINTMENT_REMINDERS', label: 'Appointment Reminders (SMS)' },
  { value: 'NO_SHOW_SWEEP', label: 'Mark Missed Appointments as No-show' },
  { value: 'STALE_VISITS', label: 'Stale Open Visits Alert' },
  { value: 'SESSION_PURGE', label: 'Session Purge' },
  { value: 'OUTBOX_DISPATCH', label: 'Message Outbox Dispatch' },
  { value: 'ETIMS_SUBMIT', label: 'KRA eTIMS Submission' },
];
export const JOB_QUEUE_STATUSES: JobQueueStatus[] = ['READY', 'ON HOLD'];

export const GL_ACCOUNT_TYPES: GlAccountType[] =
  ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

/** Account types whose balance increases on the debit side. */
export const NATURAL_DEBIT_TYPES: GlAccountType[] = ['ASSET', 'EXPENSE'];

/** Business Central's G/L "Account Type" — the account's structural role in the chart,
 *  as opposed to `type` (ASSET/LIABILITY/…) above, which is its financial-statement
 *  category. Only POSTING accounts ever carry ledger entries or a balance of their own;
 *  TOTAL and END_TOTAL roll one up from the Totaling range of accounts they name. */
export const GL_ACCOUNT_STRUCTURE_TYPES: { value: GlAccountStructureType; label: string }[] = [
  { value: 'POSTING', label: 'Posting' },
  { value: 'HEADING', label: 'Heading' },
  { value: 'TOTAL', label: 'Total' },
  { value: 'BEGIN_TOTAL', label: 'Begin-Total' },
  { value: 'END_TOTAL', label: 'End-Total' },
];

export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'DISABLED'];

export const COMPANY_TYPES = [
  'Private Limited Company',
  'Public Limited Company',
  'Company Limited by Guarantee',
  'Limited Liability Partnership',
  'Branch of a Foreign Company',
];

/** Suggested document labels; the field is free text. */
export const ATTACHMENT_CATEGORIES = [
  'National ID / Passport', 'Contract', 'Invoice', 'Receipt', 'Bank statement', 'Correspondence', 'Other',
];

/** The full "Document Status" vocabulary. */
export const DOCUMENT_STATUSES: DocumentStatus[] = [
  'Open', 'Pending Approval', 'Approved', 'Processed',
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ----------------------------------------------------------- cash office */

export interface CashTransferTypeMeta {
  value: CashTransferType;
  label: string;
  /** Movement described for the UI. */
  flow: string;
  /** Which end the creator picks, and the account_type that end must be. */
  counterparty: 'SOURCE' | 'DESTINATION';
  counterpartyType: BankAccountType;
  /** The Cashier Setup the creator must hold for the auto-resolved end. */
  creatorSetup: 'CASHIER' | 'TREASURY';
}

/** Cash-office movements between the main bank, the general cashier's vault and the cashier floats
 *  (reception, office petty cash, event floats …) — see lib/cashManagement.ts. */
export const CASH_TRANSFER_TYPES: CashTransferTypeMeta[] = [
  {
    value: 'RECEIVE_FROM_BANK', label: 'Receive from Main Bank',
    flow: 'Main Bank → General cashier vault', counterparty: 'SOURCE', counterpartyType: 'MAIN', creatorSetup: 'TREASURY',
  },
  {
    value: 'TREASURY_REQUEST', label: 'Request Float from Vault',
    flow: 'General cashier vault → your float', counterparty: 'SOURCE', counterpartyType: 'TREASURY', creatorSetup: 'CASHIER',
  },
  {
    value: 'INTER_TILL', label: 'Inter-Cashier Transfer',
    flow: 'Another cashier float → your float', counterparty: 'SOURCE', counterpartyType: 'TILL', creatorSetup: 'CASHIER',
  },
  {
    value: 'TREASURY_RETURN', label: 'Drop to Vault',
    flow: 'Your float → General cashier vault', counterparty: 'DESTINATION', counterpartyType: 'TREASURY', creatorSetup: 'CASHIER',
  },
  {
    value: 'SEND_TO_BANK', label: 'Bank the Takings',
    flow: 'General cashier vault → Main Bank', counterparty: 'DESTINATION', counterpartyType: 'MAIN', creatorSetup: 'TREASURY',
  },
];

export const cashTransferTypeMeta = (t: CashTransferType): CashTransferTypeMeta =>
  CASH_TRANSFER_TYPES.find((d) => d.value === t)!;
