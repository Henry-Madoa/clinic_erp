/* Cash office — split out of lib/types.ts; import from '@/lib/types', never from here directly. */
import type { Cents, DocumentStatus, IsoDateTime } from '../types.ts';

/* --------------------------------------------------------- cash office */

/** bank_account.account_type — see lib/cashManagement.ts. */
export type BankAccountType = 'MAIN' | 'TREASURY' | 'TILL' | 'PETTY_CASH' | 'OTHER';

/** The five cash office movements between the main bank, the vault and the cashier floats. */
export type CashTransferType =
  | 'RECEIVE_FROM_BANK' | 'TREASURY_REQUEST' | 'INTER_TILL' | 'TREASURY_RETURN' | 'SEND_TO_BANK';

export type DenominationDocumentKind = 'TRANSFER' | 'TILL_CLOSING';

export interface Denomination {
  id: number;
  code: string;
  description: string;
  value: Cents;
  active: boolean;
  sort_order: number;
}

/** One denomination row for a specific document, joined to its master for description/value. */
export interface DenominationLine {
  denomination_id: number;
  code: string;
  description: string;
  value: Cents;
  quantity: number;
  total: Cents;
}

export interface CashierSetup {
  id: number;
  user_username: string;
  setup_type: 'CASHIER' | 'TREASURY';
  bank_account_id: number;
  max_capacity: Cents;
  min_capacity: Cents;
  approval_limit: Cents;
  created_at: IsoDateTime | null;
  created_by: string | null;
}

export interface CashierSetupWithAccount extends CashierSetup {
  bank_account_code: string;
  bank_account_name: string;
  bank_account_type: BankAccountType;
}

export interface CashTransfer {
  no: string;
  document_type: CashTransferType;
  source_bank_account_id: number;
  destination_bank_account_id: number;
  amount: Cents;
  status: DocumentStatus;
  decision_reason: string | null;
  posted: boolean;
  journal_id: number | null;
  global_dimension_1_id: number | null;
  global_dimension_2_id: number | null;
  created_at: IsoDateTime | null;
  created_by: string | null;
  posted_at: IsoDateTime | null;
  posted_by: string | null;
}

export interface CashTransferView extends CashTransfer {
  source_code: string;
  source_name: string;
  source_account_type: BankAccountType;
  source_balance: Cents;
  destination_code: string;
  destination_name: string;
  destination_account_type: BankAccountType;
  destination_balance: Cents;
  journal_no: string | null;
  /** Sum of this document's denomination breakdown — see lib/denominations.ts. */
  denomination_total: Cents;
}

