import { backedSkillIds, canOverride, presentation, resolveHighlight } from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile, SkillGroup, Visibility } from '@/lib/resume/types'
import { fieldOn } from '@/lib/variants/presets'
import type { ItemPick, Recipe, SectionKey } from '@/lib/variants/types'
import { toJsonResume, type JsonDoc, type PublishMeta } from './map'
import { variantJsonUrl } from './variant-paths'

/**
 * A variant → its public JSON Resume file (variants/<slug>.json).
 *
 * The recipe is applied to the master profile first — only the items,
 * highlights and skills the variant includes, in its order, each highlight
 * in the wording the variant chose and under the same readiness rules as
 * the PDF (lib/variants/render.ts) — and the result goes through the SAME
 * mapper as profile.json (`toJsonResume`), so only PUBLIC fields are ever
 * written. On top of that:
 *   - phone and location appear only when the variant's toggle is on (and
 *     the master marks them public); the photo never;
 *   - a domain-only project is left out: the page lists every project's
 *     stack, which would claim the implementation;
 *   - an item left with no presentable highlight is left out (the portfolio
 *     schema requires at least one);
 *   - JSON Resume sections lee does not model (portfolio.extra) are not copied.
 */

function pickHighlights(list: readonly Highlight[], picks: ItemPick['highlights'], overrides: ReadonlySet<string>, parentOverridden: boolean): Highlight[] {
  return picks.flatMap((pick) => {
    const h = list.find((x) => x.id === pick.id)
    if (!h) return []
    const r = resolveHighlight(h, pick.wordingId, parentOverridden || overrides.has(h.id))
    return r ? [{ ...h, text: r.text, alternates: [] }] : []
  })
}

function work(profile: ResumeProfile, recipe: Recipe, overrides: ReadonlySet<string>): ResumeProfile['work'] {
  return recipe.work.flatMap((pick) => {
    const w = profile.work.find((x) => x.id === pick.id)
    if (!w) return []
    const highlights = pickHighlights(w.highlights, pick.highlights, overrides, false)
    return highlights.length > 0 ? [{ ...w, highlights }] : []
  })
}

function projects(profile: ResumeProfile, recipe: Recipe, overrides: ReadonlySet<string>): ResumeProfile['projects'] {
  return recipe.projects.flatMap((pick) => {
    const p = profile.projects.find((x) => x.id === pick.id)
    if (!p) return []
    const mode = presentation(p, overrides.has(p.id))
    if (mode === 'excluded' || mode === 'domain') return []
    const highlights = pickHighlights(p.highlights, pick.highlights, overrides, mode === 'override')
    return highlights.length > 0 && p.keywords.length > 0 ? [{ ...p, highlights }] : []
  })
}

/** Selected skills, grouped under their master group, groups in order of first selected skill. */
function skills(profile: ResumeProfile, recipe: Recipe, overrides: ReadonlySet<string>): SkillGroup[] {
  const backed = backedSkillIds(profile)
  const groups = new Map<string, SkillGroup>()
  for (const id of recipe.skills) {
    const group = profile.skills.find((g) => g.skills.some((s) => s.id === id))
    const skill = group?.skills.find((s) => s.id === id)
    if (!group || !skill) continue
    if (!backed.has(id) && !(overrides.has(id) && canOverride(skill))) continue
    const current = groups.get(group.id) ?? { ...group, skills: [] }
    groups.set(group.id, { ...current, skills: [...current.skills, skill] })
  }
  return [...groups.values()]
}

function byIds<T extends { id: string }>(ids: readonly string[], list: readonly T[]): T[] {
  return ids.flatMap((id) => list.filter((x) => x.id === id))
}

/** The master profile as this variant shows it (pure; never stored). */
export function variantProfile(profile: ResumeProfile, recipe: Recipe): ResumeProfile {
  const overrides = new Set(recipe.overrides)
  const on = (key: SectionKey): boolean => recipe.sections.includes(key)
  const b = profile.basics
  const off = (field: 'location' | 'phone', keys: readonly string[]): Record<string, Visibility> =>
    fieldOn(recipe, field) ? {} : Object.fromEntries(keys.map((k) => [k, 'private' as const]))
  // The photo never leaves lee; phone / location only when the variant shows them.
  const hidden: Record<string, Visibility> = { image: 'private', ...off('location', ['location', 'countryCode']), ...off('phone', ['phone']) }
  return {
    ...profile,
    basics: {
      ...b,
      label: recipe.headline || b.label,
      summary: recipe.summary || b.summary,
      visibility: { ...b.visibility, ...hidden },
    },
    work: on('work') ? work(profile, recipe, overrides) : [],
    projects: on('projects') ? projects(profile, recipe, overrides) : [],
    skills: on('skills') ? skills(profile, recipe, overrides) : [],
    education: on('education') ? byIds(recipe.education, profile.education) : [],
    languages: on('languages') ? byIds(recipe.languages, profile.languages) : [],
    certificates: on('certificates') ? byIds(recipe.certificates, profile.certificates) : [],
    portfolio: { ...profile.portfolio, extra: {} },
  }
}

/** The file lee writes to variants/<slug>.json. */
export function toVariantJsonResume(profile: ResumeProfile, recipe: Recipe, slug: string, meta: PublishMeta): JsonDoc {
  const doc = toJsonResume(variantProfile(profile, recipe), meta)
  const canonical = variantJsonUrl(profile.portfolio.canonical, slug) ?? ''
  return { ...doc, meta: { ...(doc.meta as JsonDoc), canonical } }
}
