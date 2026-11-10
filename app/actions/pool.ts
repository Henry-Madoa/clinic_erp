'use server';

import { revalidatePath } from 'next/cache';
import { requireAction } from '@/lib/session';
import { actionResult, AppError } from '@/lib/errors';
import * as pool from '@/lib/pool';
import { updateOrg } from '@/lib/org';
import type { ActionResult, DimensionValue, FormValues, Organisation } from '@/lib/types';

/* ------------------------------------------------------------- global dimensions */
export async function saveDimensionValue(
  slot: pool.DimensionSlot,
  id: number | null,
  values: FormValues,
): Promise<ActionResult<DimensionValue | { id: number }>> {
  return actionResult(async () => {
    const user = await requireAction('ADMIN_POOL_DIMENSIONS_MANAGE');
    // The slot picks a table name — never trust the client's value beyond the two known slots.
    if (slot !== 1 && slot !== 2) throw new AppError('Unknown dimension', 'VALIDATION');
    const body: pool.DimensionValueInput = {
      code: String(values.code || '').trim().toUpperCase(),
      name: String(values.name || '').trim(),
      status: values.status ? String(values.status) : null,
    };
    const result = id
      ? await pool.updateDimensionValue(slot, id, body, user)
      : await pool.createDimensionValue(slot, body, user);
    revalidatePath('/admin/pool');
    return result;
  });
}

/** Renames the Global Dimension 1/2 field captions app-wide. Kept under ADMIN:POOL_MANAGE
 *  (not ADMIN:ORG_MANAGE) so it stays alongside the rest of the Dimensions setup tab. */
export async function saveDimensionCaptions(values: FormValues): Promise<ActionResult<Organisation>> {
  return actionResult(async () => {
    const user = await requireAction('ADMIN_POOL_DIMENSIONS_MANAGE');
    const org = await updateOrg({
      global_dimension_1_caption: String(values.global_dimension_1_caption || '').trim() || 'Global Dimension 1 Code',
      global_dimension_2_caption: String(values.global_dimension_2_caption || '').trim() || 'Global Dimension 2 Code',
    }, user);
    revalidatePath('/', 'layout');
    return org;
  });
}
