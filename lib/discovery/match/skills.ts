import { conceptSatisfiers, isConcept, partialFamily, skillLabel } from './lexicon'
import type { ParsedJd } from './jd'
import { extractRequirements, REQ_WEIGHTS, type Requirement } from './requirements'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Skills / keywords overlap (0–35). Each posting skill earns credit from
 * the profile's READY skills: 1 for the skill itself (or anything that
 * satisfies a concept: Laravel for "a PHP framework"), ½ for a sibling in a
 * close family (MySQL for PostgreSQL), 0 otherwise. Credits are weighted
 * required 2 · mentioned 1 · nice-to-have ½:
 *
 *   points = round(35 × Σ weight × credit / Σ weight)
 *
 * A posting that names no recognisable skill scores the neutral midpoint,
 * unless it is not a tech role at all (then there is nothing to match).
 */

export const SKILLS_MAX = 35
const NEUTRAL = Math.round(SKILLS_MAX / 2)

export interface SkillCredit {
  req: Requirement
  credit: number
  /** "Laravel" or "MySQL ≈ PostgreSQL". */
  via: string
}

export function creditFor(canonical: string, skills: ReadonlySet<string>): { credit: number; via: string } {
  const label = skillLabel(canonical)
  if (skills.has(canonical)) return { credit: 1, via: label }
  if (isConcept(canonical)) {
    const hit = conceptSatisfiers(canonical).find((s) => skills.has(s))
    if (hit) return { credit: 1, via: `${skillLabel(hit)} ≈ ${label}` }
    return { credit: 0, via: label }
  }
  const family = partialFamily(canonical)
  if (family) {
    const sibling = [...skills].find((s) => s !== canonical && partialFamily(s) === family)
    if (sibling) return { credit: 0.5, via: `${skillLabel(sibling)} ≈ ${label}` }
  }
  return { credit: 0, via: label }
}

/** A requirement's credit: an any-of group takes its best member. */
export function requirementCredit(req: Requirement, skills: ReadonlySet<string>): { credit: number; via: string } {
  if (!req.anyOf) return creditFor(req.canonical, skills)
  const best = req.anyOf.map((m) => creditFor(m, skills)).sort((a, b) => b.credit - a.credit)[0]
  return best && best.credit > 0 ? best : { credit: 0, via: requirementLabel(req) }
}

/** "Kubernetes" or "Power BI or Tableau". */
export function requirementLabel(req: Requirement): string {
  return req.anyOf ? req.anyOf.map(skillLabel).join(' or ') : skillLabel(req.canonical)
}

export interface SkillsOutcome {
  component: MatchComponent
  matched: string[]
  missing: string[]
}

export function skillsComponent(
  job: MatchJob,
  profile: Pick<MatchProfile, 'skills'>,
  opts: { techRole?: boolean; jd?: ParsedJd } = {},
): SkillsOutcome {
  const reqs = extractRequirements(job, opts.jd)
  if (reqs.length === 0) {
    const tech = opts.techRole ?? true
    return {
      component: {
        key: 'skills',
        label: tech ? 'Skills: no stack named (neutral)' : 'Skills: no stack named',
        points: tech ? NEUTRAL : 0,
        max: SKILLS_MAX,
      },
      matched: [],
      missing: [],
    }
  }
  const credits: SkillCredit[] = reqs.map((req) => ({ req, ...requirementCredit(req, profile.skills) }))
  const total = credits.reduce((s, c) => s + REQ_WEIGHTS[c.req.weight], 0)
  const earned = credits.reduce((s, c) => s + REQ_WEIGHTS[c.req.weight] * c.credit, 0)
  const points = Math.round((SKILLS_MAX * earned) / total)
  const order = (c: SkillCredit): number => -REQ_WEIGHTS[c.req.weight]
  const matched = credits.filter((c) => c.credit > 0).sort((a, b) => order(a) - order(b)).map((c) => c.via)
  const missing = credits
    .filter((c) => c.credit === 0 && c.req.weight === 'required')
    .map((c) => `${requirementLabel(c.req)} (required)`)
  const have = credits.filter((c) => c.credit > 0).length
  const shown = matched.slice(0, 3).join(', ')
  return {
    component: {
      key: 'skills',
      label: `Skills: ${have} of ${credits.length}${shown ? ` (${shown}${matched.length > 3 ? ' …' : ''})` : ''}`,
      points,
      max: SKILLS_MAX,
    },
    matched,
    missing,
  }
}
