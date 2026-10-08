import { roleFamily, roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { checkFactLock } from '@/lib/resume/fact-lock'
import { isDomainWording, presentation, resolveHighlight } from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import { buildRecipe, familyScorer } from './presets'
import { recipeSchema, REGIONS, type ItemPick, type Recipe, type Region } from './types'

/**
 * The starter CV set: from the role families the user ACCEPTED, offer a
 * sensible variant per role × region (GCC / India / Remote). The user ticks
 * which to create; nothing is created as a full grid automatically. Each
 * recipe only picks and orders READY items and approved wordings:
 *   - interview-ready items (buildRecipe), the master text or an approved
 *     alternate that speaks the role's language better;
 *   - for the ERP / e-invoicing starter also domain-ready items, and only
 *     in their design / domain wording (never "built" or "implemented").
 */

export interface StarterRole {
  id: string
  label: string
  /** Accepted role families that make this starter relevant. */
  families: readonly string[]
  /** The family the recipe is built for. */
  recipeFamily: string
  /** Include domain-ready items in design wording. */
  domain: boolean
}

export const STARTER_ROLES: readonly StarterRole[] = [
  { id: 'payments-backend', label: 'Payments / Backend', families: ['payments', 'backend', 'api_integration'], recipeFamily: 'payments', domain: false },
  { id: 'fullstack-ts', label: 'Full-stack TypeScript', families: ['fullstack', 'frontend'], recipeFamily: 'fullstack', domain: false },
  { id: 'data-bi', label: 'Data Analyst / BI', families: ['data_analyst', 'analytics_eng', 'data'], recipeFamily: 'data_analyst', domain: false },
  { id: 'business-analyst', label: 'Business / Systems Analyst', families: ['business_analyst', 'implementation', 'solutions'], recipeFamily: 'business_analyst', domain: false },
  { id: 'erp-einvoicing', label: 'ERP / E-invoicing', families: ['erp', 'einvoicing'], recipeFamily: 'einvoicing', domain: true },
]

const REGION_SHORT: Readonly<Record<Region, string>> = { gcc: 'GCC', india: 'India', remote: 'Remote' }

export function starterName(role: Pick<StarterRole, 'label'>, region: Region): string {
  return `${role.label} · ${REGION_SHORT[region]}`
}

/** Starters for the accepted families; an accepted family no starter covers gets its own. */
export function startersFor(accepted: readonly string[]): StarterRole[] {
  const set = new Set(accepted)
  const out = STARTER_ROLES.filter((r) => r.families.some((f) => set.has(f)))
  const covered = new Set(out.flatMap((r) => r.families))
  for (const f of accepted) {
    if (covered.has(f) || !roleFamily(f)) continue
    out.push({ id: `family-${f}`, label: roleFamilyLabel(f), families: [f], recipeFamily: f, domain: false })
  }
  return out
}

export interface StarterOption {
  roleId: string
  region: Region
  name: string
  /** A variant with this region and role family already exists. */
  exists: boolean
}

export function starterOptions(
  accepted: readonly string[],
  existing: ReadonlyArray<{ region: string; roleFamily: string | null }>,
): Array<{ role: StarterRole; options: StarterOption[] }> {
  return startersFor(accepted).map((role) => ({
    role,
    options: REGIONS.map((region) => ({
      roleId: role.id,
      region,
      name: starterName(role, region),
      exists: existing.some((v) => v.region === region && v.roleFamily === role.recipeFamily),
    })),
  }))
}

/** The approved wording (master or alternate) that scores best for the role; null = master. */
function bestWording(h: Highlight, score: (t: string) => number, domain: boolean): string | null {
  const usable = h.alternates.filter((a) => checkFactLock(a.text, h.text).ok && (!domain || isDomainWording(a.text, h.text)))
  const masterOk = !domain || isDomainWording(h.text, h.text)
  let best: { id: string | null; s: number } = { id: null, s: masterOk ? score(h.text) : -1 }
  for (const a of usable) {
    const s = score(a.text)
    if (s > best.s) best = { id: a.id, s }
  }
  return best.id
}

function withWordings(profile: ResumeProfile, items: readonly ItemPick[], score: (t: string) => number): ItemPick[] {
  const all = [...profile.work, ...profile.projects].flatMap((i) => i.highlights)
  return items.map((item) => ({
    ...item,
    highlights: item.highlights.map((p) => {
      const h = all.find((x) => x.id === p.id)
      return h ? { ...p, wordingId: bestWording(h, score, presentation(h) === 'domain') } : p
    }),
  }))
}

/** Domain-ready highlights relevant to the role, in design wording only. */
function domainPicks(profile: ResumeProfile, recipe: Recipe, score: (t: string) => number): Recipe {
  const work = recipe.work.map((w) => ({ ...w, highlights: [...w.highlights] }))
  for (const w of profile.work) {
    for (const h of w.highlights) {
      const r = resolveHighlight(h, null)
      if (!r || r.mode !== 'domain' || score(r.text) === 0) continue
      const item = work.find((x) => x.id === w.id)
      const pick = { id: h.id, wordingId: r.wordingId }
      if (item) item.highlights.push(pick)
      else work.push({ id: w.id, highlights: [pick] })
    }
  }
  const order = new Map(profile.work.map((w, i) => [w.id, i] as const))
  return { ...recipe, work: work.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)) }
}

export function starterRecipe(profile: ResumeProfile, role: StarterRole, region: Region): Recipe {
  const base = buildRecipe(profile, { region, roleFamily: role.recipeFamily })
  const score = familyScorer(role.recipeFamily)
  const withDomain = role.domain ? domainPicks(profile, base, score) : base
  return recipeSchema.parse({
    ...withDomain,
    work: withWordings(profile, withDomain.work, score),
    projects: withWordings(profile, withDomain.projects, score),
  })
}

/** The role families a variant built for `roleFamily` serves (a starter covers its whole group). */
export function familiesServed(roleFamily: string | null): string[] {
  if (!roleFamily) return []
  const starter = STARTER_ROLES.find((r) => r.recipeFamily === roleFamily)
  return starter ? [...starter.families] : [roleFamily]
}
