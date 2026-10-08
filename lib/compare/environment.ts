import { ALARMING_NEWS } from '@/lib/reputation/classify'
import { companyStructureCriterion, environmentCriterion, type CriterionEvidence } from '@/lib/reputation/criteria'
import { RED_FLAG_LABELS } from '@/lib/reputation/types'
import {
  quoteAround,
  ratingScore,
  scored,
  unknownCriterion,
  withIds,
  type CriterionResult,
  type EvidenceDraft,
  type SourceRef,
} from './evidence'
import type { OpportunityInput } from './inputs'
import { travelSignal, workModeInJd } from './jd'
import type { CurrentJob, RatingKey } from './types'

/**
 * Environment and stability come from the company reputation criteria
 * (confirmed data only: the user's own review notes, a confirmed summary,
 * Wikidata facts) plus posting signals. Unconfirmed alarming news is listed
 * as a red flag to check, never scored.
 */

export interface RedFlagView {
  text: string
  confirmed: boolean
  source: SourceRef
}

const REP_SOURCE: Readonly<Record<CriterionEvidence['source'], SourceRef['kind']>> = {
  your_rating: 'your_rating',
  confirmed_summary: 'reputation',
  wikidata: 'wikidata',
}

function fromReputation(lines: readonly CriterionEvidence[], companyHref: string | null): EvidenceDraft[] {
  return lines.map((e) => ({
    text: e.label,
    effect: e.effect,
    confidence: 'known' as const,
    source: { kind: REP_SOURCE[e.source], label: e.source === 'wikidata' ? 'Wikidata' : 'Company reputation', url: companyHref },
  }))
}

const CULTURE_RE = /\bfast[\s-]paced\b|\bhustle\b|\bwork\s+hard,?\s+play\s+hard\b|\bhigh[\s-]pressure\b|\brock\s?stars?\b|\bninjas?\b|\bwear\s+many\s+hats\b/gi
const HOURS_RE = /\bnight\s+shifts?\b|\brotational\s+shifts?\b|\brotating\s+shifts?\b|\b24\s*[/x]\s*7\b|\bon[\s-]call\b|\b(?:6|six)[\s-]days?\s+(?:a\s+|per\s+)?(?:work(?:ing)?\s+)?week\b|\bweekend\s+(?:work|shifts?|support)\b|\bsaturdays?\s+(?:working|work|shifts?)\b/gi

function postingMatches(text: string, re: RegExp, max: number): Array<{ quote: string; hit: string }> {
  const out: Array<{ quote: string; hit: string }> = []
  for (const m of text.matchAll(re)) {
    if (out.some((o) => o.hit.toLowerCase() === m[0].toLowerCase())) continue
    out.push({ hit: m[0], quote: quoteAround(text, m.index ?? 0, m[0].length) })
    if (out.length >= max) break
  }
  return out
}

export function hoursSignals(description: string | null): EvidenceDraft[] {
  return postingMatches(description ?? '', HOURS_RE, 2).map((m) => ({
    text: `Hours or shifts: “${m.hit}”`,
    effect: -10,
    confidence: 'known' as const,
    source: { kind: 'posting' as const, label: 'Posting', quote: m.quote },
  }))
}

export function environmentOf(job: OpportunityInput): CriterionResult {
  const rep = job.reputation
  const companyHref = rep ? `/companies/${rep.companyId}` : null
  const culture = postingMatches(job.description ?? '', CULTURE_RE, 2).map(
    (m): EvidenceDraft => ({
      text: `Pressure signal in the posting: “${m.hit}”`,
      effect: -5,
      confidence: 'known',
      source: { kind: 'posting', label: 'Posting', quote: m.quote },
    }),
  )
  const env = rep ? environmentCriterion({ ratings: rep.ratings, summary: rep.summary, facts: rep.facts }) : null
  if (env && env.score !== null) {
    return scored('environment', env.base, [...fromReputation(env.evidence, companyHref), ...culture], 'known')
  }
  if (culture.length > 0) return scored('environment', 50, culture, 'estimated')
  return unknownCriterion('environment')
}

export function stabilityOf(job: OpportunityInput, now: Date): CriterionResult {
  const rep = job.reputation
  const companyHref = rep ? `/companies/${rep.companyId}` : null
  const structure = rep ? companyStructureCriterion({ ratings: rep.ratings, summary: rep.summary, facts: rep.facts }, now) : null
  const contract: EvidenceDraft[] =
    job.employmentType === 'contract'
      ? [{ text: 'Contract role (fixed term)', effect: -10, confidence: 'known', source: { kind: 'job_details', label: 'Employment type' } }]
      : []
  if (structure && structure.score !== null) {
    return scored('stability', structure.base, [...fromReputation(structure.evidence, companyHref), ...contract], 'known')
  }
  if (contract.length > 0) return scored('stability', 50, contract, 'estimated')
  return unknownCriterion('stability')
}

/** Confirmed red flags, plus alarming news to check (not confirmed, not scored). */
export function redFlags(job: OpportunityInput): RedFlagView[] {
  const rep = job.reputation
  if (!rep) return []
  const href = `/companies/${rep.companyId}`
  const confirmed = (rep.summary?.redFlags ?? []).map(
    (f): RedFlagView => ({
      text: `${RED_FLAG_LABELS[f.category]}: ${f.text}`,
      confirmed: true,
      source: { kind: 'reputation', label: 'Company reputation (confirmed)', url: href },
    }),
  )
  const news = rep.signals
    .filter((s) => s.category !== null && ALARMING_NEWS.has(s.category))
    .slice(0, 3)
    .map((s): RedFlagView => ({ text: s.title, confirmed: false, source: { kind: 'news', label: 'News (GDELT), not confirmed', url: s.url } }))
  return [...confirmed, ...news]
}

const MODE_RANK: Readonly<Record<string, number>> = { onsite: 0, hybrid: 1, remote: 2 }
const MODE_LABEL: Readonly<Record<string, string>> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' }

export function workLifeOf(job: OpportunityInput, current: CurrentJob | null, leave: { job: number | null; source: SourceRef | null }): CriterionResult {
  const drafts: EvidenceDraft[] = []
  const description = job.description ?? ''
  const fromJd = workModeInJd(description)
  const mode = job.remoteType && job.remoteType in MODE_RANK ? job.remoteType : (fromJd?.mode ?? null)
  const modeSource: SourceRef =
    fromJd && fromJd.mode === mode ? { kind: 'posting', label: 'Job description', quote: fromJd.quote } : { kind: 'job_details', label: 'Work mode' }
  const cur = current?.workMode ?? null
  if (mode) {
    const d = cur ? MODE_RANK[mode]! - MODE_RANK[cur]! : MODE_RANK[mode]! - 1
    drafts.push({
      text: cur ? `${MODE_LABEL[mode]} vs your ${MODE_LABEL[cur]}` : `${MODE_LABEL[mode]} work`,
      shared: `${MODE_LABEL[mode]} work`,
      effect: d * 10,
      confidence: 'known',
      source: modeSource,
    })
  }
  drafts.push(...hoursSignals(job.description), ...travelSignal(description))
  if (leave.job !== null && current?.benefits.leaveDays != null) {
    const d = leave.job - current.benefits.leaveDays
    if (Math.abs(d) >= 2) {
      drafts.push({
        text: `${leave.job} days of leave vs your ${current.benefits.leaveDays}`,
        shared: `${leave.job} days of leave (${d > 0 ? 'more' : 'fewer'} than now)`,
        effect: d > 0 ? 5 : -5,
        confidence: 'known',
        source: leave.source ?? { kind: 'posting', label: 'Posting' },
      })
    }
  }
  return drafts.length > 0 ? scored('work_life', 50, drafts, 'estimated') : unknownCriterion('work_life')
}

export function locationOf(input: {
  abroad: boolean
  remote: boolean
  placeKnown: boolean
  visa: 'yes' | 'no' | null
  relocation: boolean
  flights: boolean
  visaSource: SourceRef | null
}): CriterionResult {
  const drafts: EvidenceDraft[] = []
  const rule: SourceRef = { kind: 'rule', label: 'Job location vs yours' }
  if (input.remote) drafts.push({ text: 'Remote: no move needed', effect: 10, confidence: 'known', source: rule })
  else if (input.placeKnown && !input.abroad) drafts.push({ text: 'Same country as now: no visa or move abroad', effect: 10, confidence: 'known', source: rule })
  if (input.abroad && !input.remote) {
    if (input.visa === 'yes') drafts.push({ text: 'Visa sponsorship stated', effect: 15, confidence: 'known', source: input.visaSource ?? rule })
    else if (input.visa === 'no') drafts.push({ text: 'No visa sponsorship', effect: -25, confidence: 'known', source: input.visaSource ?? rule })
    else drafts.push({ text: 'Abroad, and visa sponsorship is not stated', effect: 0, confidence: 'unknown', source: rule })
    if (input.relocation) drafts.push({ text: 'Relocation support stated', effect: 10, confidence: 'known', source: { kind: 'posting', label: 'Posting' } })
    if (input.flights) drafts.push({ text: 'Annual flight home stated', effect: 5, confidence: 'known', source: { kind: 'posting', label: 'Posting' } })
  }
  if (drafts.every((d) => d.confidence === 'unknown')) return unknownCriterion('location', drafts)
  return scored('location', 50, drafts, input.abroad && input.visa === null ? 'estimated' : 'known')
}

function ratingResult(
  criterion: CriterionResult['criterion'],
  current: CurrentJob | null,
  keys: readonly RatingKey[],
  label: string,
): CriterionResult {
  const score = current ? ratingScore(keys.map((k) => current.ratings[k])) : null
  if (score === null || !current) return unknownCriterion(criterion)
  const parts = keys.map((k) => `${current.ratings[k] ?? '?'}/5`).join(', ')
  return {
    criterion,
    score,
    confidence: 'known',
    evidence: withIds(criterion, [{ text: `Your ${label} rating: ${parts}`, effect: 0, confidence: 'known', source: { kind: 'current_job', label: 'Your current job' } }]),
  }
}

export const currentEnvironment = (c: CurrentJob | null): CriterionResult =>
  ratingResult('environment', c, ['manager', 'culture'], 'manager and culture')
export const currentStability = (c: CurrentJob | null): CriterionResult => ratingResult('stability', c, ['security'], 'job security')
export const currentWorkLife = (c: CurrentJob | null): CriterionResult => ratingResult('work_life', c, ['workLife'], 'work-life')

export function currentLocation(c: CurrentJob | null): CriterionResult {
  if (!c?.place) return unknownCriterion('location')
  return {
    criterion: 'location',
    score: 50,
    confidence: 'known',
    evidence: withIds('location', [{ text: 'Where you are now is the baseline', effect: 0, confidence: 'known', source: { kind: 'current_job', label: 'Your current job' } }]),
  }
}
