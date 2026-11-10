import 'server-only';
import type { AnyListExport } from '../listExport.ts';
import { OPERATIONS_EXPORTS } from './operations.ts';
import { INVENTORY_EXPORTS } from './inventory.ts';
import { HR_EXPORTS } from './hr.ts';
import { STAFF_CASH_EXPORTS } from './staffCash.ts';
import { REQUISITION_EXPORTS } from './requisitions.ts';
import { CASH_MANAGEMENT_EXPORTS } from './cashManagement.ts';
import { RECEIVABLES_PAYABLES_EXPORTS } from './receivables.ts';
import { FIXED_ASSET_EXPORTS } from './fixedAssets.ts';
import { MISC_EXPORTS } from './misc.ts';
import { SELF_SERVICE_EXPORTS } from './selfService.ts';
import { ADMIN_EXPORTS } from './admin.ts';

/** Every list screen's export, by the key its page's ListTools names (app/api/export/list/[key]). */
export const LIST_EXPORTS: Record<string, AnyListExport> = {
  ...OPERATIONS_EXPORTS,
  ...INVENTORY_EXPORTS,
  ...HR_EXPORTS,
  ...STAFF_CASH_EXPORTS,
  ...REQUISITION_EXPORTS,
  ...CASH_MANAGEMENT_EXPORTS,
  ...RECEIVABLES_PAYABLES_EXPORTS,
  ...FIXED_ASSET_EXPORTS,
  ...MISC_EXPORTS,
  ...SELF_SERVICE_EXPORTS,
  ...ADMIN_EXPORTS,
};
