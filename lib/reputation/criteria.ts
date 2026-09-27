import { RED_FLAG_LABELS, type CompanyFacts, type ConfirmedSummary, type RedFlagCategory, type UserRating } from './types'

/**
 * Confirmed reputation → two Opportunity Score criteria (v17 §6.6 shape:
 * score 0–100, confidence 0–1, evidence). Pure and explainable: the score
 * is a base plus the listed effects, clamped. Only user-confirmed data
 * counts — the user's own review-site ratings, the confirmed AI summary —
 * plus Wikidata facts. With no input the score is null ("Unknown"), which
 * lowers confidence instead of the score.
 */

export type ReputationCriterion = 'environment' | 'company_structure'

export interface CriterionEvidence {
  label: string
  /** Points added to (or taken from) the base. 0 for the base line itself. */
  effect: number
  source: 'your_rating' | 'confirmed_summary' | 'wikidata'
}

export interface CriterionScore {
  criterion: ReputationCriterion
  label: string
  score: number | null
  base: number
  confidence: number
  evidence: CriterionEvidence[]
}

export interface ReputationInputs {
  ratings: readonly UserRating[]
  summary: ConfirmedSummary | null
  facts: CompanyFacts | null
}

export const NEUTRAL_BASE = 50
const PRO_CON_POINTS = 4
const PRO_CON_MAX = 12

export const ENVIRONMENT_FLAG_EFFECT: Readonly<Partial<Record<RedFlagCategory, number>>> = {
  toxic_culture: -15,
  unpaid_salaries: -20,
  visa_contract: -10,
}

export const STRUCTURE_FLAG_EFFECT: Readonly<Partial<Record<RedFlagCategory, number>>> = {
  layoffs: -15,
  unpaid_salaries: -20,
  fraud: -30,
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

function finish(
  criterion: ReputationCriterion,
  label: string,
  base: number,
  evidence: CriterionEvidence[],
  confidence: number,
): CriterionScore {
  const known = evidence.length > 0
  const total = base + evidence.reduce((s, e) => s + e.effect, 0)
  return {
    criterion,
    label,
    score: known ? clamp(total) : null,
    base,
    confidence: known ? Math.min(1, Math.round(confidence * 100) / 100) : 0,
    evidence,
  }
}

function flagEvidence(
  summary: ConfirmedSummary | null,
  effects: Readonly<Partial<Record<RedFlagCategory, number>>>,
): CriterionEvidence[] {
  if (!summary) return []
  // One effect per category, however many flags share it.
  const categories = [...new Set(summary.redFlags.map((f) => f.category))]
  return categories.flatMap((c) => {
    const effect = effects[c]
    return effect ? [{ label: `Red flag you confirmed: ${RED_FLAG_LABELS[c]}`, effect, source: 'confirmed_summary' as const }] : []
  })
}

export function environmentCriterion(inputs: ReputationInputs): CriterionScore {
  const ratings = inputs.ratings
  const avg = ratings.length > 0 ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null
  const base = avg === null ? NEUTRAL_BASE : clamp(((avg - 1) / 4) * 100)
  const ratingLines: CriterionEvidence[] = ratings.map((r) => ({
    label: `Your ${r.site} rating: ${r.rating.toFixed(1)}/5`,
    effect: 0,
    source: 'your_rating',
  }))
  const s = inputs.summary
  const proCon: CriterionEvidence[] = s
    ? [
        ...(s.pros.length > 0
          ? [{ label: `${s.pros.length} confirmed pro(s)`, effect: Math.min(PRO_CON_MAX, s.pros.length * PRO_CON_POINTS), source: 'confirmed_summary' as const }]
          : []),
        ...(s.cons.length > 0
          ? [{ label: `${s.cons.length} confirmed con(s)`, effect: -Math.min(PRO_CON_MAX, s.cons.length * PRO_CON_POINTS), source: 'confirmed_summary' as const }]
          : []),
      ]
    : []
  const evidence = [...ratingLines, ...proCon, ...flagEvidence(s, ENVIRONMENT_FLAG_EFFECT)]
  const confidence = Math.min(0.6, ratings.length * 0.2) + (s ? 0.4 : 0)
  return finish('environment', 'Environment & culture', base, evidence, confidence)
}

function yearsSince(founded: string, now: Date): number | null {
  const year = Number(founded.slice(0, 4))
  return Number.isFinite(year) ? now.getUTCFullYear() - year : null
}

function factEvidence(facts: CompanyFacts | null, now: Date): CriterionEvidence[] {
  if (!facts) return []
  const age = facts.founded ? yearsSince(facts.founded, now) : null
  const ageLine: CriterionEvidence[] =
    age === null
      ? []
      : [
          {
            label: `Founded ${facts.founded?.slice(0, 4)} (${age} years)`,
            effect: age >= 20 ? 15 : age >= 10 ? 10 : age < 3 ? -5 : 0,
            source: 'wikidata',
          },
        ]
  const n = facts.employees
  const sizeLine: CriterionEvidence[] =
    n === null
      ? []
      : [
          {
            label: `About ${n.toLocaleString('en-US')} employees`,
            effect: n >= 1000 ? 10 : n >= 50 ? 5 : n < 20 ? -5 : 0,
            source: 'wikidata',
          },
        ]
  return [...ageLine, ...sizeLine]
}

export function companyStructureCriterion(inputs: ReputationInputs, now: Date = new Date()): CriterionScore {
  const facts = factEvidence(inputs.facts, now)
  const flags = flagEvidence(inputs.summary, STRUCTURE_FLAG_EFFECT)
  const evidence = [...facts, ...flags]
  const confidence = (facts.length > 0 ? 0.4 : 0) + (inputs.summary ? 0.4 : 0)
  return finish('company_structure', 'Company structure & stability', NEUTRAL_BASE, evidence, confidence)
}

export function reputationCriteria(inputs: ReputationInputs, now: Date = new Date()): CriterionScore[] {
  return [environmentCriterion(inputs), companyStructureCriterion(inputs, now)]
}
