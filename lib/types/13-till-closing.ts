/* till closing (cashier end-of-day) — split out of lib/types.ts; import from '@/lib/types', never from here directly. */
import type { Cents, IsoDate, IsoDateTime } from '../types.ts';

/* ------------------------------------------------- till closing (cashier end-of-day) */

export interface TillClosing {
  no: string;
  closing_date: IsoDate;
  till_bank_account_id: number;
  cashier_username: string;
  treasury_bank_account_id: number | null;
  /** Till balance at the start of the day (system), the day's movements and the resulting system balance. */
  opening_balance: Cents;
  cash_in: Cents;
  cash_out: Cents;
  system_balance: Cents;
  /** The physical count (sum of the denomination lines). */
  counted_amount: Cents;
  /** counted − system: negative = shortage, positive = overage. */
  variance: Cents;
  variance_reason: string | null;
  return_to_treasury: boolean;
  returned_amount: Cents;
  status: string;
  decision_reason: string | null;
  posted: boolean;
  posted_at: IsoDateTime | null;
  posted_by: string | null;
  variance_journal_id: number | null;
  handover_journal_id: number | null;
  created_at: IsoDateTime | null;
  created_by: string | null;
}

export interface TillClosingView extends TillClosing {
  till_code: string;
  till_name: string;
  till_balance_now: Cents;
  treasury_code: string | null;
  treasury_name: string | null;
  variance_journal_no: string | null;
  handover_journal_no: string | null;
}


