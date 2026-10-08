import { detectSeniority, SENIORITY_LABELS, SENIORITY_LEVELS, type SeniorityLevel } from '@/lib/discovery/relevance/seniority'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import type { PostingBenefits } from './benefits'
import { jdStatus, scopeSignals, techInJd, type JdTech } from './jd'
import { quoteAround, ratingScore, scored, unknownCriterion, withIds, type CriterionResult, type EvidenceDraft } from './evidence'
import type { OpportunityInput, ProfileContext } from './inputs'
import type { CurrentJob } from './types'

/**
 * Growth: role level vs the current title, the posting's stack vs the
 * master profile (new skills to learn, matched against the study list),
 * domain fit (payments, e-invoicing, data), learning budget / mentoring
 * mentions, and company facts and funding news from the reputation
 * record. Base 50; every effect is listed. An inference, so "estimated".
 */

export const GROWTH_EFFECTS = {
  levelUp: 15,
  levelDown: -15,
  newSkill: 3,
  newSkillMax: 12,
  studyMatch: 4,
  studyMatchMax: 8,
  domainFit: 8,
  newDomain: 3,
  learningBudget: 6,
  mentoring: 6,
  funding: 5,
} as const

export interface StackView {
  overlap: string[]
  novel: string[]
  onStudyList: string[]
}

export interface GrowthOutcome {
  result: CriterionResult
  jobLevel: SeniorityLevel | null
  currentLevel: SeniorityLevel | null
  stack: StackView
}

const DOMAINS: ReadonlyArray<{ id: string; label: string; terms: readonly string[] }> = [
  { id: 'payments', label: 'payments', terms: ['payments', 'payment gateway', 'fintech', 'ledger', 'payouts', 'remittance', 'wallet', 'acquiring'] },
  { id: 'einvoicing', label: 'e-invoicing', terms: ['e-invoicing', 'einvoicing', 'e-invoice', 'zatca', 'fatoora', 'electronic invoicing'] },
  { id: 'data', label: 'data', terms: ['data platform', 'data engineering', 'data pipeline', 'data pipelines', 'etl', 'analytics platform'] },
]

const rank = (l: SeniorityLevel): number => SENIORITY_LEVELS.indexOf(l)
const norm = (s: string): string => normalizeForMatch(s).trim()

/** A title's level; an unmarked title ("Software Engineer") reads as Mid-level. */
export function levelOf(title: string | null | undefined): { level: SeniorityLevel; assumed: boolean } | null {
  if (!title?.trim()) return null
  const level = detectSeniority(title)
  return level ? { level, assumed: false } : { level: 'mid', assumed: true }
}

function levelDraft(job: ReturnType<typeof levelOf>, cur: ReturnType<typeof levelOf>): EvidenceDraft[] {
  if (!job || !cur) return []
  const d = rank(job.level) - rank(cur.level)
  const a = SENIORITY_LABELS[job.level]
  const b = SENIORITY_LABELS[cur.level]
  const base = d > 0 ? `Step up: ${a} vs your ${b}` : d < 0 ? `Step down: ${a} vs your ${b}` : `Same level as now (${a})`
  const note = job.assumed || cur.assumed ? ' (a title without a level reads as Mid-level)' : ''
  const effect = d > 0 ? GROWTH_EFFECTS.levelUp : d < 0 ? GROWTH_EFFECTS.levelDown : 0
  const shared = d > 0 ? `Step up from your current level (${a})` : d < 0 ? `Step down from your current level (${a})` : `Same level as now (${a})`
  return [{ text: `${base}${note}`, shared, effect, confidence: 'estimated', source: { kind: 'rule', label: 'Title seniority' } }]
}

export function stackView(techStack: readonly string[], ctx: ProfileContext): StackView {
  const mine = new Set(ctx.skills.map(norm).filter(Boolean))
  const study = ctx.studyLabels.map(norm).filter(Boolean)
  const stack = [...new Map(techStack.map((t) => [norm(t), t.trim()] as const)).entries()].filter(([k]) => k)
  const overlap = stack.filter(([k]) => mine.has(k)).map(([, v]) => v)
  const novel = stack.filter(([k]) => !mine.has(k)).map(([, v]) => v)
  const onStudyList = stack.filter(([k]) => study.some((s) => s === k || s.includes(k))).map(([, v]) => v)
  return { overlap, novel, onStudyList }
}

function stackDrafts(s: StackView, jdTech: readonly JdTech[]): EvidenceDraft[] {
  const out: EvidenceDraft[] = []
  const profile = { kind: 'master_profile' as const, label: 'Your master profile' }
  const lineOf = (terms: readonly string[]): string | null =>
    jdTech.find((t) => terms.some((x) => norm(x) === norm(t.term)))?.quote ?? null
  const jdSource = (terms: readonly string[]) => {
    const quote = lineOf(terms)
    return quote ? { kind: 'posting' as const, label: 'Job description vs your master profile', quote } : profile
  }
  if (s.overlap.length > 0) out.push({ text: `Stack you know: ${s.overlap.join(', ')}`, effect: 0, confidence: 'known', source: jdSource(s.overlap) })
  if (s.novel.length > 0) {
    const effect = Math.min(GROWTH_EFFECTS.newSkillMax, s.novel.length * GROWTH_EFFECTS.newSkill)
    out.push({ text: `New to learn: ${s.novel.join(', ')}`, effect, confidence: 'estimated', source: jdSource(s.novel) })
  }
  if (s.onStudyList.length > 0) {
    const effect = Math.min(GROWTH_EFFECTS.studyMatchMax, s.onStudyList.length * GROWTH_EFFECTS.studyMatch)
    out.push({ text: `On your study list: ${s.onStudyList.join(', ')}`, effect, confidence: 'known', source: { kind: 'study_list', label: 'Your study list' } })
  }
  return out
}

function domainDrafts(description: string, title: string, ctx: ProfileContext): EvidenceDraft[] {
  const posting = normalizeForMatch(`${title} ${description}`.slice(0, 8_000))
  const mine = normalizeForMatch(`${ctx.domainText} ${ctx.skills.join(' | ')}`)
  const out: EvidenceDraft[] = []
  for (const d of DOMAINS) {
    const hits = findTerms(posting, d.terms)
    if (hits.length === 0) continue
    const fit = findTerms(mine, d.terms).length > 0
    const at = description.toLowerCase().indexOf(hits[0]!)
    out.push({
      text: fit ? `Domain fit: ${d.label}, which you have done` : `New domain: ${d.label}`,
      effect: fit ? GROWTH_EFFECTS.domainFit : GROWTH_EFFECTS.newDomain,
      confidence: 'estimated',
      source: { kind: 'posting', label: 'Posting', quote: at >= 0 ? quoteAround(description, at, hits[0]!.length) : null },
    })
  }
  return out
}

const MENTOR_RE = /\bmentor(?:ship|ing|s)?\b|\bcareer\s+(?:path|progression|development)\b|\bpromotion\s+path\b/i

function learningDrafts(description: string, benefits: PostingBenefits): EvidenceDraft[] {
  const out: EvidenceDraft[] = []
  const learning = benefits.learning
  if (learning?.value === 'yes') {
    out.push({ text: 'Learning budget mentioned', effect: GROWTH_EFFECTS.learningBudget, confidence: 'known', source: learning.source })
  }
  const m = MENTOR_RE.exec(description)
  if (m) {
    out.push({
      text: 'Mentoring or a career path mentioned',
      effect: GROWTH_EFFECTS.mentoring,
      confidence: 'known',
      source: { kind: 'posting', label: 'Posting', quote: quoteAround(description, m.index, m[0].length) },
    })
  }
  return out
}

function companyDrafts(job: OpportunityInput): EvidenceDraft[] {
  const rep = job.reputation
  if (!rep) return []
  const out: EvidenceDraft[] = []
  const f = rep.facts
  if (f?.employees != null) {
    const stage = f.employees < 50 ? 'early-stage' : f.employees < 1000 ? 'growth-stage' : 'large'
    out.push({ text: `About ${f.employees.toLocaleString('en-US')} employees (${stage})`, effect: 0, confidence: 'known', source: { kind: 'wikidata', label: 'Wikidata', url: f.wikipediaUrl } })
  }
  const funding = rep.signals.find((s) => s.category === 'funding')
  if (funding) {
    out.push({ text: `Funding news: ${funding.title}`, effect: GROWTH_EFFECTS.funding, confidence: 'estimated', source: { kind: 'news', label: 'News (GDELT)', url: funding.url } })
  }
  return out
}

export function growthCriterion(input: {
  job: OpportunityInput
  current: CurrentJob | null
  profile: ProfileContext
  benefits: PostingBenefits
}): GrowthOutcome {
  const { job, current, profile, benefits } = input
  const description = job.description ?? ''
  const jobLevel = levelOf(job.title)
  const currentLevel = levelOf(current?.title)
  // Growth is read from the job description, never the title alone.
  if (jdStatus(description) === 'thin') {
    return {
      result: unknownCriterion('growth', [NO_JD, ...companyDrafts(job)]),
      jobLevel: jobLevel?.level ?? null,
      currentLevel: currentLevel?.level ?? null,
      stack: stackView(job.techStack, profile),
    }
  }
  const jdTech = techInJd(description)
  const stack = stackView([...job.techStack, ...jdTech.map((t) => t.term)], profile)
  const drafts = [
    ...levelDraft(jobLevel, currentLevel),
    ...scopeSignals(description),
    ...stackDrafts(stack, jdTech),
    ...domainDrafts(description, job.title, profile),
    ...learningDrafts(description, benefits),
    ...companyDrafts(job),
  ]
  const result = scored('growth', 50, drafts, 'estimated')
  return { result, jobLevel: jobLevel?.level ?? null, currentLevel: currentLevel?.level ?? null, stack }
}

/** Evidence line for criteria the description can't support. */
export const NO_JD: EvidenceDraft = {
  text: 'Unknown (no description): paste the job description to compare this',
  effect: 0,
  confidence: 'unknown',
  source: { kind: 'posting', label: 'Job description (missing or too short)' },
}

export function currentGrowthCriterion(current: CurrentJob | null): CriterionResult {
  const score = current ? ratingScore([current.ratings.growth, current.ratings.techStack]) : null
  if (score === null || !current) return unknownCriterion('growth')
  return {
    criterion: 'growth',
    score,
    confidence: 'known',
    evidence: withIds('growth', [
      {
        text: `Your ratings: growth ${current.ratings.growth ?? '?'}/5, tech stack ${current.ratings.techStack ?? '?'}/5`,
        effect: 0,
        confidence: 'known',
        source: { kind: 'current_job', label: 'Your current job' },
      },
    ]),
  }
}
