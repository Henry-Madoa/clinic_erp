import { getCurrentUser } from '@/lib/session';
import { ACTIONS, canAction, canPage } from '@/lib/permissions';
import { ForbiddenError, AppError } from '@/lib/errors';
import { LIST_EXPORTS } from '@/lib/listExports';
import { parseFilters } from '@/lib/listFilters';
import { parseSort } from '@/lib/listSort';
import { buildWorkbookBuffer, excelResponse } from '@/lib/excel';

/** Every list screen's "Export to Excel" (lib/listExport.ts): the list's own guard, then its rows. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return new Response('Sign in to export', { status: 401 });
    const { key } = await params;
    const def = Object.hasOwn(LIST_EXPORTS, key) ? LIST_EXPORTS[key] : undefined;
    if (!def) return new Response('Unknown export', { status: 404 });

    if (!def.action && !def.page) throw new ForbiddenError(key);
    const actions = def.action === undefined ? [] : Array.isArray(def.action) ? def.action : [def.action];
    if (actions.length && !actions.some((a) => canAction(user, a))) throw new ForbiddenError(ACTIONS[actions[0]].page);
    const missing = def.alsoRequires?.find((a) => !canAction(user, a));
    if (missing) throw new ForbiddenError(ACTIONS[missing].page);

    const { searchParams } = new URL(request.url);
    const base = {
      q: (searchParams.get('q') ?? '').slice(0, 100),
      view: searchParams.get('view') ?? '',
      filters: parseFilters(searchParams.get('filters')),
      sort: parseSort(searchParams.get('sort')),
      params: searchParams,
    };
    const page = typeof def.page === 'function' ? def.page(base) : def.page;
    const pages = page === undefined ? [] : Array.isArray(page) ? page : [page];
    if (pages.length && !pages.some((p) => canPage(user, p))) throw new ForbiddenError(pages[0]);

    const rows = await def.rows({ ...base, user });
    const buffer = await buildWorkbookBuffer(def.sheet, def.columns, rows);
    return excelResponse(buffer, def.filename);
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Export failed';
    const status = err instanceof AppError && err.code === 'FORBIDDEN' ? 403 : 400;
    return new Response(message, { status });
  }
}
