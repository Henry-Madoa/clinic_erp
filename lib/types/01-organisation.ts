/* organisation — split out of lib/types.ts; import from '@/lib/types', never from here directly. */
import type { Cents, IsoDate, IsoDateTime } from '../types.ts';

/* ------------------------------------------------------------ organisation */

export interface Organisation {
  id: 1;
  name: string;
  short_name: string | null;
  motto: string | null;
  registration_no: string | null;
  vat_registration_no: string | null;
  incorporation_date: string | null;
  ict_authority_licence_no: string | null;
  odpc_registration_no: string | null;
  kra_pin: string | null;
  company_type: string | null;
  physical_address: string | null;
  postal_address: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  website: string | null;
  paybill_no: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  /** The name the account is held in — printed above the number on an invoice. */
  bank_account_name: string | null;
  bank_account_no: string | null;
  /** General Ledger Setup: receipts at or above this need approval; below it the creator may
   *  post their own. See lib/receipts.ts postReceipt(). */
  receipt_approval_limit: Cents;
  /** AL General Ledger Setup "Petty Cash Limit" — above it, raise an imprest instead. */
  petty_cash_limit: Cents;
  /** AL "Max No Outstanding Imprests" an employee may hold unsurrendered. */
  max_outstanding_imprests: number;
  /** The employee subledger control account every imprest, refund and claim posts through. */
  imprest_control_account_id: number | null;
  /** Date formula from issue to the surrender due date. */
  imprest_surrender_period: string;
  /** Company Information "Signature" — the CEO's signature image, printed on every demand notice. */
  ceo_signature: string | null;
  ceo_name: string | null;
  /** Sign-in background photograph (Cloudinary public_id), its darkening 0–85, and whether the app shows it too. */
  background_image: string | null;
  background_overlay: number;
  background_in_app: number;
  /** Cashier end-of-day: a till shortage is debited here, an overage credited here — lib/tillClosings.ts. */
  till_shortage_account_id: number | null;
  till_overage_account_id: number | null;
  logo: string | null;
  currency_code: string;
  currency_symbol: string;
  locale: string;
  timezone: string;
  date_format: string;
  fy_start_month: number;
  fy_start_day: number;
  statement_footer: string | null;
  global_dimension_1_caption: string;
  global_dimension_2_caption: string;
  /** BC's General Ledger Setup "Allow Posting From"/"Allow Posting To" — see
   *  lib/postingDates.ts. Null = unrestricted. */
  allow_posting_from: IsoDate | null;
  allow_posting_to: IsoDate | null;
  /** AL General Ledger Setup "Validate Cash Denomination" — when true a cash document's
   *  denomination breakdown must total exactly its amount. See lib/denominations.ts. */
  validate_cash_denomination: boolean;
  updated_at: IsoDateTime | null;
  updated_by: string | null;
}

/** The branding and money-formatting subset every page needs. */
export type OrgBrand = Pick<
  Organisation,
  'name' | 'short_name' | 'motto' | 'logo' | 'currency_code' | 'currency_symbol'
  | 'locale' | 'timezone' | 'website' | 'phone_primary' | 'email' | 'registration_no'
  | 'background_overlay' | 'background_in_app'
> & {
  /** The background photograph, ready to render (a delivery URL), or null. */
  background: string | null;
};

export type ThemeTokens = Record<string, string>;

export interface Theme {
  preset: string;
  tokens: ThemeTokens;
  updated_at?: IsoDateTime | null;
  updated_by?: string | null;
}

export interface ThemePreset {
  key: string;
  label: string;
  tokens: ThemeTokens;
}

type TokenType = 'color' | 'text' | 'select';

interface TokenDefinition {
  key: string;
  label: string;
  type: TokenType;
  help?: string;
  options?: string[];
}

export interface TokenGroup {
  group: string;
  items: TokenDefinition[];
}
