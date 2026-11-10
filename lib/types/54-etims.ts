/* KRA eTIMS — split out of lib/types.ts; import from '@/lib/types', never from here directly. */
import type { Cents, IsoDateTime } from '../types.ts';

export type EtimsSourceType = 'SALES_INVOICE' | 'SALES_CREDIT_MEMO';
export type EtimsStatus = 'PENDING' | 'SIGNED' | 'FAILED';

export interface EtimsInvoice {
  id: number;
  source_type: EtimsSourceType;
  source_no: string;
  rcpt_type: 'S' | 'R';
  org_invc_no: number | null;
  invc_no: number | null;
  status: EtimsStatus;
  cust_tin: string | null;
  cust_name: string | null;
  pmt_type: string;
  total: Cents;
  tax_total: Cents;
  attempts: number;
  last_error: string | null;
  next_attempt_at: IsoDateTime | null;
  cur_rcpt_no: number | null;
  tot_rcpt_no: number | null;
  intrl_data: string | null;
  rcpt_sign: string | null;
  sdc_date_time: string | null;
  sdc_id: string | null;
  mrc_no: string | null;
  created_at: IsoDateTime;
  signed_at: IsoDateTime | null;
}
