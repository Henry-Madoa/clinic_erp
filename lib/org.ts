import { one, run, audit } from './db.ts';
import { assertContactColumns } from './validate.ts';
import { PRESETS, ALL_KEYS, TOKEN_GROUPS } from './themes.ts';
import { AppError } from './errors.ts';
import { imageSrc } from './cloudinary.ts';
import type { Actor, OrgBrand, Organisation, Theme, ThemePreset, ThemeTokens } from './types.ts';

export { TOKEN_GROUPS };

const ORG_FIELDS = [
  'name', 'short_name', 'motto', 'registration_no', 'vat_registration_no', 'incorporation_date', 'ict_authority_licence_no', 'odpc_registration_no', 'kra_pin', 'company_type',
  'physical_address', 'postal_address', 'city', 'county', 'country', 'phone_primary', 'phone_secondary',
  'email', 'website', 'paybill_no', 'bank_name', 'bank_branch', 'bank_account_name', 'bank_account_no',
  'logo', 'currency_code',
  'currency_symbol', 'locale', 'timezone', 'date_format', 'fy_start_month', 'fy_start_day', 'statement_footer',
  'global_dimension_1_caption', 'global_dimension_2_caption',
  'allow_posting_from', 'allow_posting_to', 'validate_cash_denomination', 'receipt_approval_limit',
  'petty_cash_limit', 'max_outstanding_imprests', 'imprest_control_account_id', 'imprest_surrender_period',
  'ceo_signature', 'ceo_name',
  'background_image', 'background_overlay', 'background_in_app',
  'till_shortage_account_id', 'till_overage_account_id',
] as const satisfies readonly (keyof Organisation)[];

export type OrgField = (typeof ORG_FIELDS)[number];
export type OrgUpdate = Partial<Record<OrgField, string | number | null>>;

export function getOrg(): Promise<Organisation | undefined> {
  return one<Organisation>('SELECT * FROM organisation WHERE id = 1');
}

/**
 * The subset of the organisation record every page needs for branding and money
 * formatting.
 *
 * `logo` comes back as a ready-to-render URL, not the stored Cloudinary
 * public_id — this is read on every request by the shell and the sign-in
 * screen, and none of those callers should know where media lives.
 */
export async function getOrgBrand(): Promise<OrgBrand | null> {
  const o = await getOrg();
  if (!o) return null;
  return {
    name: o.name, short_name: o.short_name, motto: o.motto,
    logo: imageSrc(o.logo, { width: 96, height: 96, crop: 'fit' }),
    currency_code: o.currency_code, currency_symbol: o.currency_symbol,
    locale: o.locale, timezone: o.timezone, website: o.website,
    phone_primary: o.phone_primary, email: o.email, registration_no: o.registration_no,
    background: imageSrc(o.background_image, { width: 2400, crop: 'limit' }),
    background_overlay: Number(o.background_overlay ?? 45), background_in_app: Number(o.background_in_app ?? 0),
  };
}

/** The two Global Dimension field labels, admin-renameable — falls back to the schema defaults. */
export async function getDimensionCaptions(): Promise<{ caption1: string; caption2: string }> {
  const o = await getOrg();
  return {
    caption1: o?.global_dimension_1_caption || 'Global Dimension 1 Code',
    caption2: o?.global_dimension_2_caption || 'Global Dimension 2 Code',
  };
}

export async function getTheme(): Promise<Theme> {
  const t = await one<{ preset: string; tokens: string; updated_at: string | null; updated_by: string | null }>(
    'SELECT * FROM theme WHERE id = 1',
  );
  if (!t) return { preset: 'emerald-standard', tokens: PRESETS['emerald-standard'].tokens };
  return {
    preset: t.preset,
    tokens: JSON.parse(t.tokens) as ThemeTokens,
    updated_at: t.updated_at,
    updated_by: t.updated_by,
  };
}

export const themePresets = (): ThemePreset[] =>
  Object.entries(PRESETS).map(([key, v]) => ({ key, label: v.label, tokens: v.tokens }));

export async function updateOrg(body: OrgUpdate, user: Actor): Promise<Organisation> {
  assertContactColumns(body as Record<string, unknown>);
  if (body.name !== undefined && !String(body.name).trim()) {
    throw new AppError('Company name is required', 'VALIDATION');
  }
  if (body.background_overlay !== undefined) {
    const v = Number(body.background_overlay);
    if (!Number.isInteger(v) || v < 0 || v > 85) throw new AppError('Background darkening is 0 to 85%', 'VALIDATION');
    body.background_overlay = v;
  }
  if (body.background_in_app !== undefined) body.background_in_app = Number(body.background_in_app) ? 1 : 0;
  if (body.logo && String(body.logo).length > 2_000_000) {
    throw new AppError('Logo must be under 1.5 MB', 'LOGO_TOO_LARGE');
  }
  if (body.allow_posting_from && body.allow_posting_to && body.allow_posting_from > body.allow_posting_to) {
    throw new AppError('Allow Posting From cannot be after Allow Posting To', 'VALIDATION');
  }
  const before = (await getOrg())!;
  const cols = ORG_FIELDS.filter((f) => body[f] !== undefined);
  if (!cols.length) return before;

  await run(
    `UPDATE organisation SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ?, updated_by = ? WHERE id = 1`,
    ...cols.map((c) => body[c]!), new Date().toISOString(), user.username,
  );
  const changed = cols.filter((f) => body[f] !== before[f] && f !== 'logo' && f !== 'background_image');
  await audit(user, 'ORG_UPDATE', 'organisation', 1, { changed, logoChanged: body.logo !== undefined, backgroundChanged: body.background_image !== undefined });
  return (await getOrg())!;
}

export async function updateTheme(
  { tokens, preset }: { tokens: ThemeTokens; preset?: string },
  user: Actor,
): Promise<Theme> {
  if (!tokens || typeof tokens !== 'object') throw new AppError('tokens object is required', 'VALIDATION');
  const clean: ThemeTokens = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (!ALL_KEYS.includes(k)) continue;
    const val = String(v).trim();
    // Values are interpolated into a stylesheet, so anything that could break
    // out of the declaration is rejected rather than escaped.
    if (!val || /[;{}<>]/.test(val)) throw new AppError(`Invalid value for ${k}`, 'VALIDATION');
    clean[k] = val;
  }
  const missing = ALL_KEYS.filter((k) => !(k in clean));
  if (missing.length) throw new AppError(`Missing theme tokens: ${missing.join(', ')}`, 'VALIDATION');

  await run(
    'UPDATE theme SET preset = ?, tokens = ?, updated_at = ?, updated_by = ? WHERE id = 1',
    preset || 'custom', JSON.stringify(clean), new Date().toISOString(), user.username,
  );
  await audit(user, 'THEME_UPDATE', 'theme', 1, { preset: preset || 'custom' });
  return getTheme();
}

/*
 * Applying a preset is deliberately not a server action: the editor loads the
 * preset into its working state so the change previews live, and only the
 * explicit Save writes it. That keeps one write path — updateTheme.
 */

/** Theme tokens as an inline `:root { … }` rule for the document head. */
export const themeCss = (tokens: ThemeTokens): string =>
  `:root{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`;
