import { DynamicFilterBar } from './dynamic-filter';
import { ExportButton } from './export-button';
import type { FilterFieldDef } from '@/lib/listFilters';

/**
 * The dynamic filter + "Export to Excel" pair every list screen carries (lib/listExport.ts).
 * `params` are the page's own query values the export must repeat (search, view…); the filter
 * rows ride along from `paramName` — a page with several lists gives each its own — as the
 * export's `filters`. The filter stays usable while a filter is set, even if it matched nothing,
 * so it can always be taken off again.
 */
export function ListTools({ exportKey, fields, filters, params, paramName = 'filters', count }: {
  exportKey: string;
  fields: FilterFieldDef[];
  /** The raw value of `paramName` from the URL. */
  filters: string | undefined;
  params?: Record<string, string | undefined>;
  paramName?: string;
  /** Rows on screen — nothing to export when 0. */
  count: number;
}) {
  return (
    <>
      <DynamicFilterBar fields={fields} paramName={paramName} disabled={!count && !filters} />
      <ExportButton href={`/api/export/list/${exportKey}`} params={{ ...params, filters }} disabled={!count} />
    </>
  );
}
