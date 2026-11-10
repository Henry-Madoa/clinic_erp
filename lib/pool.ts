import { one, all, run, audit } from './db.ts';
import { AppError } from './errors.ts';
import type { Actor, County, DimensionValue, SubCountyWithCounty } from './types.ts';

/* ------------------------------------------------------------------- counties */
/** Kenya's counties — the address lookup on employee and client records. */
export const listCounties = (): Promise<County[]> =>
  all<County>("SELECT * FROM county WHERE status = 'ACTIVE' ORDER BY code NULLS LAST, name");

export const listSubCounties = (): Promise<SubCountyWithCounty[]> =>
  all<SubCountyWithCounty>(
    `SELECT s.*, c.name AS county_name FROM sub_county s JOIN county c ON c.id = s.county_id
     WHERE s.status = 'ACTIVE' ORDER BY c.name, s.name`,
  );

/* ------------------------------------------------------------- global dimensions */

export type DimensionSlot = 1 | 2;

const DIMENSION_TABLE: Record<DimensionSlot, string> = {
  1: 'global_dimension_1_value',
  2: 'global_dimension_2_value',
};

export interface DimensionValueInput {
  code?: string;
  name?: string;
  status?: string | null;
}

export const listDimensionValues = (slot: DimensionSlot): Promise<DimensionValue[]> =>
  all<DimensionValue>(`SELECT * FROM ${DIMENSION_TABLE[slot]} ORDER BY name`);

export const listActiveDimensionValues = (slot: DimensionSlot): Promise<DimensionValue[]> =>
  all<DimensionValue>(`SELECT * FROM ${DIMENSION_TABLE[slot]} WHERE status = 'ACTIVE' ORDER BY name`);

export async function createDimensionValue(
  slot: DimensionSlot, { code, name, status }: DimensionValueInput, user: Actor,
): Promise<{ id: number }> {
  if (!code || !name) throw new AppError('Code and name are required', 'VALIDATION');
  const table = DIMENSION_TABLE[slot];
  if (await one(`SELECT 1 FROM ${table} WHERE code = ? OR name = ?`, code, name)) {
    throw new AppError('That value already exists', 'DUPLICATE');
  }
  const info = await run(
    `INSERT INTO ${table} (code, name, status) VALUES (?,?,?)`,
    code, name, status || 'ACTIVE',
  );
  await audit(user, `GLOBAL_DIMENSION_${slot}_VALUE_CREATE`, table, info.lastInsertRowid, { code, name });
  return { id: Number(info.lastInsertRowid) };
}

export async function updateDimensionValue(
  slot: DimensionSlot, id: number, { name, status }: DimensionValueInput, user: Actor,
): Promise<DimensionValue> {
  const table = DIMENSION_TABLE[slot];
  await run(
    `UPDATE ${table} SET name=COALESCE(?,name), status=COALESCE(?,status) WHERE id=?`,
    name ?? null, status ?? null, id,
  );
  await audit(user, `GLOBAL_DIMENSION_${slot}_VALUE_UPDATE`, table, id, { name, status });
  return (await one<DimensionValue>(`SELECT * FROM ${table} WHERE id=?`, id))!;
}
