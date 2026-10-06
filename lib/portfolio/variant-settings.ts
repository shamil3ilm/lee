import * as variantsQ from '@/lib/db/queries/resumeVariants'
import type { ResumeVariantRow } from '@/lib/db/queries/resumeVariants'
import { VariantError } from '@/lib/variants/service'
import { isVariantSlug, slugify } from './variant-paths'

/**
 * The per-variant "publish to portfolio" toggle (OFF by default) and its
 * page address. Rules:
 *   - turning it on gives the variant a slug from its name when it has none
 *     (unique among the user's variants);
 *   - a published variant keeps its slug: changing the address would leave
 *     the old file behind, so the user unpublishes first;
 *   - turning a published variant off goes through Unpublish (which deletes
 *     the file after a confirmation), never through a plain save.
 */

export interface PortfolioSettingsInput {
  publishToPortfolio: boolean
  /** Empty = keep / derive from the name. */
  slug: string
}

async function freeSlug(userId: string, variantId: string, base: string): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const suffix = i === 1 ? '' : `-${i}`
    const candidate = `${base.slice(0, 60 - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!(await variantsQ.slugTaken(userId, candidate, variantId))) return candidate
  }
  throw new VariantError('Choose a different page address.')
}

export async function resolvePortfolioSettings(
  userId: string,
  variant: ResumeVariantRow,
  name: string,
  input: PortfolioSettingsInput,
): Promise<Pick<ResumeVariantRow, 'publishToPortfolio' | 'portfolioSlug'>> {
  const published = variant.portfolioLastSha !== null
  const requested = input.slug.trim().toLowerCase()
  if (requested && !isVariantSlug(requested)) {
    throw new VariantError('Use lowercase letters, digits and dashes for the page address (up to 60).')
  }
  if (published) {
    if (!input.publishToPortfolio) throw new VariantError('This variant is on your portfolio: unpublish it to turn this off.')
    if (requested && requested !== variant.portfolioSlug) throw new VariantError('Unpublish the variant first to change its page address.')
    return { publishToPortfolio: true, portfolioSlug: variant.portfolioSlug }
  }
  if (requested) {
    if (await variantsQ.slugTaken(userId, requested, variant.id)) throw new VariantError('Another variant already uses this page address.')
    return { publishToPortfolio: input.publishToPortfolio, portfolioSlug: requested }
  }
  if (!input.publishToPortfolio) return { publishToPortfolio: false, portfolioSlug: variant.portfolioSlug }
  const slug = isVariantSlug(variant.portfolioSlug) ? variant.portfolioSlug : await freeSlug(userId, variant.id, slugify(name))
  return { publishToPortfolio: true, portfolioSlug: slug }
}
