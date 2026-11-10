/* No. Series — split out of lib/types.ts; import from '@/lib/types', never from here directly. */

/* --------------------------------------------------------------- No. Series */

export interface NoSeries {
  code: string;
  description: string;
  default_nos: number;
  manual_nos: number;
  date_order: number;
}

export interface NoSeriesLine {
  id: number;
  series_code: string;
  line_no: number;
  starting_date: string | null;
  starting_no: string;
  ending_no: string | null;
  last_no_used: string | null;
  last_date_used: string | null;
  warning_no: string | null;
  increment_by_no: number;
  open: number;
  allow_gaps: number;
}

export interface NoSeriesWithLines extends NoSeries {
  lines: NoSeriesLine[];
}

export interface DocumentNoSeriesRow {
  document_code: string;
  label: string;
  category: string;
  sort: number;
  series_code: string | null;
  series_description: string | null;
  last_no_used: string | null;
  next_no: string | null;
  manual_nos: number;
}

