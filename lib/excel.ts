import 'server-only';
import ExcelJS from 'exceljs';
import { requireAction } from './session.ts';
import { AppError, ForbiddenError } from './errors.ts';
import { canPage } from './permissions.ts';
import type { ActionKey } from './permissions.ts';

export interface ExcelColumn<T> {
  header: string;
  key: string;
  width?: number;
  value: (row: T) => string | number | Date | null;
}

/** Builds a single-sheet workbook — the one shape every list export in this app needs. */
export async function buildWorkbookBuffer<T>(
  sheetName: string, columns: ExcelColumn<T>[], rows: T[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(row)])));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A downloadable .xlsx Response, ready to return from an API route. */
export function excelResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}

/** Shared shape for every /api/export/* route: the same permission the list page itself
 *  requires — its action, and for a tab of a module gated tab by tab (requireModuleTab) that
 *  tab's page — then the query + workbook build, with a uniform error response either way. */
export async function excelExportResponse(
  action: ActionKey, build: () => Promise<{ filename: string; buffer: Buffer }>, page?: string,
): Promise<Response> {
  try {
    const user = await requireAction(action);
    if (page && !canPage(user, page)) throw new ForbiddenError(page);
    const { filename, buffer } = await build();
    return excelResponse(buffer, filename);
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Export failed';
    const status = err instanceof AppError && err.code === 'FORBIDDEN' ? 403 : 400;
    return new Response(message, { status });
  }
}
