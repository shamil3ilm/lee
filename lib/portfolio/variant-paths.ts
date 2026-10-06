/**
 * Client-safe: where a published variant lives. The portfolio build
 * (scripts/build-resume.mjs in the portfolio repo) renders every
 * `variants/<slug>.json` next to profile.json as `resume/<slug>.html`, and
 * requires the file's meta.canonical to be `<origin>/variants/<slug>.json`.
 */

export const VARIANT_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/
const MAX_SLUG = 60

export function isVariantSlug(value: unknown): value is string {
  return typeof value === 'string' && VARIANT_SLUG.test(value)
}

/** "GCC · Payments / Fintech" → "gcc-payments-fintech". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '')
  return slug || 'resume'
}

/** variants/<slug>.json in the same folder as profile.json. */
export function variantRepoPath(profilePath: string, slug: string): string {
  const dir = profilePath.includes('/') ? profilePath.slice(0, profilePath.lastIndexOf('/') + 1) : ''
  return `${dir}variants/${slug}.json`
}

function originOf(canonical: string): string | null {
  try {
    const url = new URL(canonical)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/** meta.canonical of the variant file (null when the portfolio canonical URL is not set). */
export function variantJsonUrl(canonical: string, slug: string): string | null {
  const origin = originOf(canonical)
  return origin ? `${origin}/variants/${slug}.json` : null
}

/** The public page the portfolio renders for the variant. */
export function variantPageUrl(canonical: string, slug: string): string | null {
  const origin = originOf(canonical)
  return origin ? `${origin}/resume/${slug}.html` : null
}
