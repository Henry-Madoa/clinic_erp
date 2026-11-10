'use server';

import { revalidatePath } from 'next/cache';
import { requireAction } from '@/lib/session';
import { actionResult } from '@/lib/errors';
import { createDenomination, updateDenomination } from '@/lib/denominations';
import type { ActionResult, FormValues } from '@/lib/types';

export async function saveDenomination(
  id: number | null, values: FormValues,
): Promise<ActionResult<{ id: number } | { updated: true }>> {
  return actionResult(async () => {
    const user = await requireAction('DENOMINATIONS_MANAGE');
    const value = Math.round(Number(values.value || 0) * 100);
    const sortOrder = values.sort_order ? Number(values.sort_order) : 0;
    if (id) {
      await updateDenomination(id, {
        description: String(values.description || ''),
        value,
        active: !!Number(values.active),
        sortOrder,
      });
      revalidatePath('/admin/pool/denominations');
      return { updated: true };
    }
    const res = await createDenomination({
      code: String(values.code || ''),
      description: String(values.description || ''),
      value,
      sortOrder,
    }, user);
    revalidatePath('/admin/pool/denominations');
    return res;
  });
}
