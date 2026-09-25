/**
 * v12.0 — HEADLINE scores. Combines dimension results into the user-facing
 * scores and Total Match.
 *
 *   Role Match       = AI requirement fit 60% + role/title alignment 40%   (JD only)
 *   Skills Match     = keyword & skill coverage                             (JD only)
 *   Experience Match = seniority/years 65% + domain/industry 35%            (JD only)
 *   ATS              = parse/format checks (+ 30% JD keyword presence with a JD;
 *                      presence halved when keyword stuffing is detected)
 *   Impact / Readability / Structure = their dimension
 *
 * Total Match (JD):   Role 25 · Skills 20 · Experience 15 · ATS 20 · Impact 10 · Readability 5 · Structure 5
 * CV Quality (no JD): ATS 35 · Impact 30 · Readability 20 · Structure 15
 *
 * Any skipped score/component is dropped and the remaining weights are
 * renormalised; the result lists what was skipped and why.
 */
import type { AtsDetails } from './dimensions/ats'
import type { DomainDetails } from './dimensions/domain'
import type { ImpactDetails } from './dimensions/impact'
import type { KeywordDetails } from './dimensions/keywords'
import type { ReadabilityDetails } from './dimensions/readability'
import type { SeniorityDetails } from './dimensions/seniority'
import type { StructureDetails } from './dimensions/structure'
import type { RequirementFitDetails } from './requirement-fit'
import type { RoleAlignmentDetails } from './dimensions/role-alignment'
import {
  isSkipped,
  type BreakdownItem,
  type ComponentHeadlineKey,
  type DimensionKey,
  type DimensionOutcome,
  type DimensionResult,
  type Grade,
  type HeadlineScore,
  type SkippedEntry,
} from './types'

export const COMPONENT_KEYS: readonly ComponentHeadlineKey[] = [
  'roleMatch', 'skillsMatch', 'experienceMatch', 'ats', 'impact', 'readability', 'structure',
]

export const JD_ONLY_KEYS: readonly ComponentHeadlineKey[] = ['roleMatch', 'skillsMatch', 'experienceMatch']

export const TOTAL_WEIGHTS_JD: Record<ComponentHeadlineKey, number> = {
  roleMatch: 25, skillsMatch: 20, experienceMatch: 15, ats: 20, impact: 10, readability: 5, structure: 5,
}

export const TOTAL_WEIGHTS_GENERAL: Record<ComponentHeadlineKey, number> = {
  roleMatch: 0, skillsMatch: 0, experienceMatch: 0, ats: 35, impact: 30, readability: 20, structure: 15,
}

export const HEADLINE_LABELS: Record<ComponentHeadlineKey | 'total', string> = {
  total: 'Total Match',
  roleMatch: 'Role Match',
  skillsMatch: 'Skills Match',
  experienceMatch: 'Experience Match',
  ats: 'ATS Score',
  impact: 'Impact Score',
  readability: 'Readability Score',
  structure: 'Structure Score',
}

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'A'
  if (score >= 75) return 'B'
  if (score >= 65) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

export function bandWord(score: number): string {
  if (score >= 85) return 'Excellent'
  if (score >= 75) return 'Strong'
  if (score >= 65) return 'Good'
  if (score >= 50) return 'Needs work'
  return 'Weak'
}

interface Component {
  key: string
  label: string
  score: number | null
  weight: number
  note?: string
}

/** Weighted mean over non-null components, weights renormalised. */
export function blend(components: Component[]): { score: number | null; breakdown: BreakdownItem[] } {
  const live = components.filter((c) => c.score !== null && c.weight > 0)
  const total = live.reduce((s, c) => s + c.weight, 0)
  const breakdown = components.map((c) => ({
    key: c.key,
    label: c.label,
    score: c.score,
    weight: c.score !== null && total > 0 ? Math.round((c.weight / total) * 1000) / 1000 : 0,
    ...(c.note ? { note: c.note } : {}),
  }))
  if (live.length === 0 || total === 0) return { score: null, breakdown }
  const score = Math.round(live.reduce((s, c) => s + (c.score as number) * c.weight, 0) / total)
  return { score, breakdown }
}

function dimScore(d: DimensionOutcome | undefined): number | null {
  return d && !isSkipped(d) ? d.score : null
}

function dimNote(d: DimensionOutcome | undefined): string | undefined {
  return d && isSkipped(d) ? d.reason : undefined
}

function details<T>(d: DimensionOutcome | undefined): T | undefined {
  return d && !isSkipped(d) ? ((d as DimensionResult).details as T) : undefined
}

type Dims = Partial<Record<DimensionKey, DimensionOutcome>>

interface Built {
  score: number | null
  breakdown: BreakdownItem[]
  verdict: (score: number) => string
  reason?: string
}

function buildRoleMatch(d: Dims): Built {
  const fit = details<RequirementFitDetails>(d.requirementFit)
  const align = details<RoleAlignmentDetails>(d.roleAlignment)
  const { score, breakdown } = blend([
    { key: 'requirementFit', label: 'Requirement fit (AI, verified)', score: dimScore(d.requirementFit), weight: 0.6, note: dimNote(d.requirementFit) },
    { key: 'roleAlignment', label: 'Title & responsibilities alignment', score: dimScore(d.roleAlignment), weight: 0.4 },
  ])
  return {
    score,
    breakdown,
    reason: isSkipped(d.requirementFit) ? `Requirement fit skipped: ${d.requirementFit.reason}` : undefined,
    verdict: (s) =>
      fit
        ? `${bandWord(s)} — ${fit.met} of ${fit.items.length} requirements met${fit.partial ? `, ${fit.partial} partial` : ''}`
        : `${bandWord(s)} — based on title${align?.responsibilitiesTotal ? ' & responsibilities' : ''} alignment only`,
  }
}

function buildSkillsMatch(d: Dims): Built {
  const k = details<KeywordDetails>(d.keywords)
  const { score, breakdown } = blend([
    { key: 'keywords', label: 'Skill & keyword coverage', score: dimScore(d.keywords), weight: 1, note: dimNote(d.keywords) },
  ])
  return {
    score,
    breakdown,
    reason: dimNote(d.keywords),
    verdict: (s) => {
      if (!k) return bandWord(s)
      const total = k.required.length + k.niceToHave.length
      return `${bandWord(s)} — ${k.matched.length} of ${total} JD skills matched, ${k.missing.length} missing`
    },
  }
}

function buildExperienceMatch(d: Dims): Built {
  const sen = details<SeniorityDetails>(d.seniority)
  const dom = details<DomainDetails>(d.domain)
  const { score, breakdown } = blend([
    { key: 'seniority', label: 'Years & seniority', score: dimScore(d.seniority), weight: 0.65, note: dimNote(d.seniority) },
    { key: 'domain', label: 'Domain / industry', score: dimScore(d.domain), weight: 0.35, note: dimNote(d.domain) },
  ])
  return {
    score,
    breakdown,
    verdict: (s) => {
      const parts: string[] = []
      if (sen) {
        const need = sen.requiredYears ?? (sen.jdLevel ? sen.jdLevel : null)
        parts.push(`~${sen.years} yrs${need !== null ? ` vs ${typeof need === 'number' ? `${need}+ required` : need}` : ''}`)
      }
      if (dom) parts.push(`${dom.match === 'strong' ? 'same' : dom.match === 'related' ? 'adjacent' : 'different'} industry`)
      return `${bandWord(s)}${parts.length ? ` — ${parts.join(' · ')}` : ''}`
    },
  }
}

function buildAts(d: Dims, jdMode: boolean): Built {
  const a = details<AtsDetails>(d.ats)
  const k = details<KeywordDetails>(d.keywords)
  const stuffed = a?.stuffing.stuffed ?? false
  const presence = jdMode && k ? Math.round(k.presence * (stuffed ? 0.5 : 1) * 100) : null
  const { score, breakdown } = blend([
    { key: 'format', label: 'Parseability & format', score: dimScore(d.ats), weight: jdMode && presence !== null ? 0.7 : 1 },
    ...(jdMode
      ? [{
          key: 'keywordPresence',
          label: stuffed ? 'JD keyword presence (halved: stuffing)' : 'JD keyword presence',
          score: presence,
          weight: 0.3,
          note: presence === null ? dimNote(d.keywords) : undefined,
        }]
      : []),
  ])
  return {
    score,
    breakdown,
    verdict: (s) => {
      if (!a) return bandWord(s)
      const passed = a.checks.filter((c) => c.points === c.max).length
      return `${bandWord(s)} — ${passed}/${a.checks.length} parse checks passed${presence !== null ? `, ${presence}% of JD keywords present` : ''}`
    },
  }
}

function buildSingle(key: 'impact' | 'readability' | 'structure', d: Dims): Built {
  const label = { impact: 'Quantification & action verbs', readability: 'Clarity & readability', structure: 'Structure & length' }[key]
  const { score, breakdown } = blend([{ key, label, score: dimScore(d[key]), weight: 1, note: dimNote(d[key]) }])
  return {
    score,
    breakdown,
    verdict: (s) => {
      if (key === 'impact') {
        const i = details<ImpactDetails>(d.impact)
        return i ? `${bandWord(s)} — ${i.quantified} of ${i.bullets} bullets quantified` : bandWord(s)
      }
      if (key === 'readability') {
        const r = details<ReadabilityDetails>(d.readability)
        return r ? `${bandWord(s)} — ${r.avgWords} words per bullet on average` : bandWord(s)
      }
      const st = details<StructureDetails>(d.structure)
      return st ? `${bandWord(s)} — ~${st.pages} page${st.pages > 1 ? 's' : ''}, ${st.years} yrs of experience` : bandWord(s)
    },
  }
}

export interface ComposeInput {
  dimensions: Dims
  jdMode: boolean
  targetTitle?: string
}

export interface ComposeOutput {
  total: HeadlineScore
  scores: Record<ComponentHeadlineKey, HeadlineScore>
  weights: { key: ComponentHeadlineKey; label: string; base: number; effective: number }[]
  skipped: SkippedEntry[]
}

const NO_JD_REASON = 'Pick a job to see match'

export function composeHeadlines(input: ComposeInput): ComposeOutput {
  const { dimensions: d, jdMode } = input
  const baseWeights = jdMode ? TOTAL_WEIGHTS_JD : TOTAL_WEIGHTS_GENERAL
  const skipped: SkippedEntry[] = []

  for (const [key, outcome] of Object.entries(d) as [DimensionKey, DimensionOutcome][]) {
    if (isSkipped(outcome)) skipped.push({ key, code: outcome.code, reason: outcome.reason })
  }

  const built: Record<ComponentHeadlineKey, Built | null> = {
    roleMatch: jdMode ? buildRoleMatch(d) : null,
    skillsMatch: jdMode ? buildSkillsMatch(d) : null,
    experienceMatch: jdMode ? buildExperienceMatch(d) : null,
    ats: buildAts(d, jdMode),
    impact: buildSingle('impact', d),
    readability: buildSingle('readability', d),
    structure: buildSingle('structure', d),
  }

  const live = COMPONENT_KEYS.filter((k) => built[k]?.score !== null && built[k] !== null && baseWeights[k] > 0)
  const liveTotal = live.reduce((s, k) => s + baseWeights[k], 0)
  const effective = (k: ComponentHeadlineKey): number =>
    live.includes(k) && liveTotal > 0 ? Math.round((baseWeights[k] / liveTotal) * 1000) / 1000 : 0

  const scores = {} as Record<ComponentHeadlineKey, HeadlineScore>
  for (const k of COMPONENT_KEYS) {
    const b = built[k]
    const base = { key: k, label: HEADLINE_LABELS[k], weight: effective(k), baseWeight: baseWeights[k] }
    if (!b) {
      scores[k] = { ...base, score: null, grade: null, skipped: true, reason: NO_JD_REASON, verdict: NO_JD_REASON, breakdown: [] }
      skipped.push({ key: k, code: 'no_jd', reason: NO_JD_REASON })
      continue
    }
    if (b.score === null) {
      const reason = b.reason ?? b.breakdown.map((x) => x.note).filter(Boolean).join('; ')
      scores[k] = { ...base, score: null, grade: null, skipped: true, reason: reason || 'Not enough signal', verdict: 'Not enough signal to score', breakdown: b.breakdown }
      skipped.push({ key: k, code: 'insufficient_signal', reason: reason || 'Not enough signal' })
      continue
    }
    scores[k] = {
      ...base,
      score: b.score,
      grade: gradeFor(b.score),
      ...(b.reason ? { reason: b.reason } : {}),
      verdict: b.verdict(b.score),
      breakdown: b.breakdown,
    }
  }

  const totalScore = liveTotal > 0
    ? Math.round(live.reduce((s, k) => s + (scores[k].score as number) * baseWeights[k], 0) / liveTotal)
    : 0
  const totalLabel = jdMode ? 'Total Match' : 'CV Quality'
  const total: HeadlineScore = {
    key: 'total',
    label: totalLabel,
    score: totalScore,
    grade: gradeFor(totalScore),
    weight: 0,
    baseWeight: 100,
    verdict: jdMode
      ? `${bandWord(totalScore)} match${input.targetTitle ? ` for ${input.targetTitle}` : ''}`
      : `${bandWord(totalScore)} overall CV quality`,
    breakdown: COMPONENT_KEYS.filter((k) => baseWeights[k] > 0).map((k) => ({
      key: k,
      label: HEADLINE_LABELS[k],
      score: scores[k].score,
      weight: effective(k),
      ...(scores[k].skipped ? { note: scores[k].reason } : {}),
    })),
  }

  const weights = COMPONENT_KEYS.filter((k) => baseWeights[k] > 0).map((k) => ({
    key: k,
    label: HEADLINE_LABELS[k],
    base: baseWeights[k],
    effective: effective(k),
  }))

  return { total, scores, weights, skipped }
}
