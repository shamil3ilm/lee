import * as variantsQ from '@/lib/db/queries/resumeVariants'
import type { ResumeVariantRow } from '@/lib/db/queries/resumeVariants'
import * as profileQ from '@/lib/db/queries/profile'
import { roleFamily, ROLE_FAMILIES } from '@/lib/discovery/relevance/roles'
import { canonicalJson } from '@/lib/portfolio/canonical'
import { getResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { buildRecipe, defaultVariantName } from './presets'
import { renderVariant, type RenderedResume, type RenderOptions } from './render'
import type { VariantSummary } from './suggest'
import { parseRecipe, recipeSchema, type Recipe, type Region } from './types'

/**
 * Variants are created on demand (never as a full region × role grid) and
 * versioned: a save that changes the recipe appends a version; an
 * application records the exact version it used.
 */

export class VariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VariantError'
  }
}

export interface LoadedVariant {
  variant: ResumeVariantRow
  version: number
  recipe: Recipe
}

/** Role families the user accepted in search preferences (role_types that name a family). */
export async function acceptedFamilies(userId: string): Promise<Array<{ id: string; label: string }>> {
  const row = await profileQ.get(userId)
  const accepted = new Set(row?.roleTypes ?? [])
  return ROLE_FAMILIES.filter((f) => accepted.has(f.id)).map((f) => ({ id: f.id, label: f.label }))
}

export async function createVariant(
  userId: string,
  input: { region: Region; roleFamily: string | null; lengthTarget?: 1 | 2; name?: string },
): Promise<ResumeVariantRow> {
  const family = input.roleFamily && roleFamily(input.roleFamily) ? input.roleFamily : null
  const { profile } = await getResumeProfile(userId)
  const recipe = buildRecipe(profile, { region: input.region, roleFamily: family, lengthTarget: input.lengthTarget })
  const name = (input.name?.trim() || defaultVariantName(input.region, family)).slice(0, 120)
  return variantsQ.create(userId, { name, region: input.region, roleFamily: family, recipe })
}

export async function loadVariant(userId: string, variantId: string, version?: number): Promise<LoadedVariant> {
  const variant = await variantsQ.getById(userId, variantId)
  if (!variant) throw new VariantError('Variant not found.')
  const v = version ?? variant.currentVersion
  const row = await variantsQ.getVersion(userId, variantId, v)
  if (!row) throw new VariantError(`Version ${v} of this variant was not found.`)
  return { variant, version: v, recipe: parseRecipe(row.recipe) }
}

/** Save a recipe: a new version when it changed, else nothing. */
export async function saveRecipe(
  userId: string,
  variantId: string,
  input: unknown,
): Promise<{ variant: ResumeVariantRow; changed: boolean }> {
  const parsed = recipeSchema.safeParse(input)
  if (!parsed.success) throw new VariantError('Some variant settings are invalid.')
  const current = await loadVariant(userId, variantId)
  if (canonicalJson(current.recipe) === canonicalJson(parsed.data)) return { variant: current.variant, changed: false }
  const variant = await variantsQ.addVersion(userId, current.variant, {
    recipe: parsed.data,
    region: parsed.data.region,
    roleFamily: parsed.data.roleFamily,
  })
  return { variant, changed: true }
}

export async function renderStored(
  userId: string,
  variantId: string,
  version?: number,
  profile?: ResumeProfile,
  opts: RenderOptions = {},
): Promise<LoadedVariant & { rendered: RenderedResume }> {
  const loaded = await loadVariant(userId, variantId, version)
  const master = profile ?? (await getResumeProfile(userId)).profile
  return { ...loaded, rendered: renderVariant(master, loaded.recipe, opts) }
}

export async function variantSummaries(userId: string): Promise<VariantSummary[]> {
  const rows = await variantsQ.list(userId)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region as Region,
    roleFamily: r.roleFamily,
    currentVersion: r.currentVersion,
  }))
}

/** Record the variant (at its current version) an application uses; null clears it. */
export async function chooseVariantForApplication(
  userId: string,
  applicationId: string,
  variantId: string | null,
): Promise<{ variantId: string; version: number } | null> {
  if (variantId === null) {
    if (!(await variantsQ.setApplicationVariant(userId, applicationId, null))) throw new VariantError('Application not found.')
    return null
  }
  const variant = await variantsQ.getById(userId, variantId)
  if (!variant || variant.archivedAt) throw new VariantError('Variant not found.')
  const choice = { variantId: variant.id, version: variant.currentVersion }
  if (!(await variantsQ.setApplicationVariant(userId, applicationId, choice))) throw new VariantError('Application not found.')
  return choice
}
