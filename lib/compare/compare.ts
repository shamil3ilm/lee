import { reputationDeepLinks, type DeepLink } from '@/lib/reputation/deep-links'
import { postingBenefits } from './benefits'
import { benefitChecklist, benefitsCriterion, currentBenefitsCriterion, type ChecklistRow } from './checklist'
import {
  currentEnvironment,
  currentLocation,
  currentStability,
  currentWorkLife,
  environmentOf,
  locationOf,
  redFlags,
  stabilityOf,
  workLifeOf,
  type RedFlagView,
} from './environment'
import { withIds, type CriterionResult } from './evidence'
import { currentGrowthCriterion, growthCriterion, NO_JD, type StackView } from './growth'
import { jdStatus, type JdStatus } from './jd'
import { placeOf, type OpportunityInput, type ProfileContext } from './inputs'
import { currentPayCriterion, payCriterion, type PayView } from './pay'
import { weightedTotal, type WeightedTotal } from './score'
import { CRITERIA, defaultWeights, type Assumptions, type Criterion, type CurrentJob, type Place } from './types'
import { comparisonChip, gainsAndLosses, questionsToAsk, verdictLine, type ListItem, type Question } from './verdict'

/**
 * One opportunity vs the current job: the deterministic comparison every
 * view renders (card, side-by-side page, chips). Pure; no I/O.
 */

export const COMPARE_RULES_VERSION = '1.0.0'

export interface SideView {
  criteria: Record<Criterion, CriterionResult>
  scores: Record<Criterion, number | null>
  total: WeightedTotal
}

export interface ReviewsView {
  companyHref: string | null
  links: DeepLink[]
  ratings: Array<{ site: string; rating: number; summary: string; url: string | null }>
  average: number | null
}

export interface Comparison {
  key: string
  title: string
  companyName: string | null
  href: string
  url: string | null
  /** Whether the job description is long enough to read; thin → "Paste the JD". */
  jd: { status: JdStatus; pasted: boolean; canPaste: boolean }
  place: { job: Place | null; remote: boolean; abroad: boolean }
  job: SideView
  current: SideView | null
  pay: PayView
  checklist: ChecklistRow[]
  stack: StackView
  redFlags: RedFlagView[]
  reviews: ReviewsView
  verdict: string
  gains: ListItem[]
  losses: ListItem[]
  unknowns: ListItem[]
  questions: Question[]
  chip: string
  weights: Record<Criterion, number>
}

function side(criteria: Record<Criterion, CriterionResult>, weights: Record<Criterion, number>): SideView {
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, criteria[c].score])) as Record<Criterion, number | null>
  return { criteria, scores, total: weightedTotal(scores, weights) }
}

function reviewsOf(job: OpportunityInput): ReviewsView {
  const rep = job.reputation
  const ratings = (rep?.ratings ?? []).map((r) => ({ site: r.site, rating: r.rating, summary: r.summary, url: r.url }))
  const average = ratings.length > 0 ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10 : null
  const links = job.companyName ? (reputationDeepLinks(job.companyName).find((g) => g.id === 'reviews')?.links ?? []) : []
  return { companyHref: rep ? `/companies/${rep.companyId}` : null, links, ratings, average }
}

/** A criterion the missing description leaves unknown says so in its evidence. */
function markThin(r: CriterionResult): CriterionResult {
  if (r.score !== null) return r
  const drafts = [NO_JD, ...r.evidence.map((e) => ({ text: e.text, shared: e.shared, effect: e.effect, confidence: e.confidence, source: e.source }))]
  return { ...r, evidence: withIds(r.criterion, drafts) }
}

export function currentSide(current: CurrentJob | null, weights: Record<Criterion, number>): SideView | null {
  if (!current) return null
  return side(
    {
      pay: currentPayCriterion(current),
      benefits: currentBenefitsCriterion(current.benefits),
      growth: currentGrowthCriterion(current),
      environment: currentEnvironment(current),
      stability: currentStability(current),
      location: currentLocation(current),
      work_life: currentWorkLife(current),
    },
    weights,
  )
}

export function compareOpportunity(input: {
  job: OpportunityInput
  current: CurrentJob | null
  assumptions: Assumptions
  profile: ProfileContext
  now: Date
}): Comparison {
  const { job, current, assumptions, profile, now } = input
  const weights = defaultWeights(current?.wantMore ?? [])
  const where = placeOf(job.location, job.remoteType, current?.place ?? null)
  const abroad = !where.remote && where.place !== null && current?.place != null && where.place !== current.place
  const benefits = postingBenefits({ text: job.description, structured: job.structuredBenefits, remoteType: job.remoteType })
  const checklist = benefitChecklist({ posting: benefits, current: current?.benefits ?? null, abroad })
  const pay = payCriterion({
    job,
    current,
    assumptions,
    jobPlace: where.place,
    housingProvided: benefits.housing?.value === 'yes',
  })
  const growth = growthCriterion({ job, current, profile, benefits })
  const criteria: Record<Criterion, CriterionResult> = {
    pay: pay.result,
    benefits: benefitsCriterion(checklist),
    growth: growth.result,
    environment: environmentOf(job),
    stability: stabilityOf(job, now),
    location: locationOf({
      abroad,
      remote: where.remote,
      placeKnown: where.place !== null && current?.place != null,
      visa: benefits.visa?.value ?? null,
      relocation: benefits.relocation?.value === 'yes',
      flights: benefits.flights?.value === 'yes',
      visaSource: benefits.visa?.source ?? null,
    }),
    work_life: workLifeOf(job, current, { job: benefits.leave?.days ?? null, source: benefits.leave?.source ?? null }),
  }
  const status = jdStatus(job.description)
  const marked: Record<Criterion, CriterionResult> =
    status === 'thin'
      ? { ...criteria, pay: markThin(criteria.pay), benefits: markThin(criteria.benefits), environment: markThin(criteria.environment), work_life: markThin(criteria.work_life) }
      : criteria
  const jobSide = side(marked, weights)
  const currentView = currentSide(current, weights)
  const verdictInput = { job: jobSide.scores, current: currentView?.scores ?? null, pay: pay.view, checklist }
  const lists = gainsAndLosses(verdictInput)
  return {
    key: job.key,
    title: job.title,
    companyName: job.companyName,
    href: job.href,
    url: job.url,
    jd: { status, pasted: job.jdPasted === true, canPaste: job.kind === 'discovery' },
    place: { job: where.place, remote: where.remote, abroad },
    job: jobSide,
    current: currentView,
    pay: pay.view,
    checklist,
    stack: growth.stack,
    redFlags: redFlags(job),
    reviews: reviewsOf(job),
    verdict: verdictLine(verdictInput),
    ...lists,
    questions: questionsToAsk(verdictInput),
    chip: comparisonChip(verdictInput),
    weights,
  }
}
