import * as appsQ from '@/lib/db/queries/applications'
import * as cmpQ from '@/lib/db/queries/jobComparison'
import * as profileQ from '@/lib/db/queries/profile'
import * as repQ from '@/lib/db/queries/companyReputation'
import type { Discovery } from '@/lib/db/queries/discoveries'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { readStoredProfile, seedProfile } from '@/lib/resume/service'
import { studyList } from '@/lib/resume/study'
import type { ResumeProfile } from '@/lib/resume/types'
import { compareOpportunity, currentSide, type Comparison, type SideView } from './compare'
import { opportunityKey, parseOpportunityKey, type OpportunityInput, type ProfileContext, type ReputationInput } from './inputs'
import { defaultWeights, parseAssumptions, parseCurrentJob, type Assumptions, type CurrentJob } from './types'

/**
 * Loads what a comparison needs (DB reads only, no AI, no network) and
 * runs the pure rules. Nothing here logs pay, benefits or ratings.
 */

export interface ComparisonSettings {
  current: CurrentJob | null
  assumptions: Assumptions
  narratives: unknown
  factorShortlist: boolean
}

export async function loadSettings(userId: string): Promise<ComparisonSettings> {
  const row = await cmpQ.get(userId)
  return {
    current: parseCurrentJob(row.currentJob),
    assumptions: parseAssumptions(row.assumptions),
    narratives: row.narratives,
    factorShortlist: row.factorShortlist,
  }
}

async function resumeOf(userId: string, row: UserProfile | null): Promise<ResumeProfile> {
  return (await readStoredProfile(userId, row)) ?? seedProfile(row)
}

/** Employer and title of the master profile's current work item (no end date). */
export function currentWorkItem(profile: ResumeProfile): { employer: string; title: string } | null {
  const w = profile.work.find((x) => !x.endDate) ?? null
  return w ? { employer: w.name, title: w.position } : null
}

export async function prefillFromProfile(userId: string): Promise<{ employer: string; title: string } | null> {
  const row = await profileQ.get(userId)
  return currentWorkItem(await resumeOf(userId, row))
}

export function profileContextOf(profile: ResumeProfile, row: UserProfile | null): ProfileContext {
  const skills = [...profile.skills.flatMap((g) => g.skills.map((s) => s.name)), ...(row?.skills ?? [])]
  const domainText = [
    profile.basics.label,
    profile.basics.summary,
    ...profile.work.flatMap((w) => [w.name, w.position, w.summary, ...w.keywords, ...w.highlights.map((h) => h.text)]),
    ...profile.projects.flatMap((p) => [p.name, p.description, ...p.keywords]),
    ...(row?.industries ?? []),
  ].join(' \n ')
  return { skills, studyLabels: studyList(profile).map((s) => s.label), domainText: domainText.slice(0, 20_000) }
}

export async function loadProfileContext(userId: string): Promise<ProfileContext> {
  const row = await profileQ.get(userId)
  return profileContextOf(await resumeOf(userId, row), row)
}

async function reputationFor(userId: string, companyId: string | null): Promise<ReputationInput | null> {
  if (!companyId) return null
  const rec = await repQ.get(userId, companyId)
  if (!rec) return null
  return { companyId, ratings: rec.userRatings, summary: rec.summary, facts: rec.facts, signals: rec.signals }
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

async function fromDiscovery(userId: string, d: Discovery): Promise<OpportunityInput | null> {
  const n = d.normalized as Partial<NormalizedJob> & { kind?: string }
  if (n.kind && n.kind !== 'job') return null
  const company = await cmpQ.findCompany(userId, { domain: n.companyDomain ?? hostOf(n.companyWebsite) ?? null, name: n.companyName ?? null })
  return {
    key: opportunityKey('discovery', d.id),
    kind: 'discovery',
    id: d.id,
    title: n.title ?? 'Untitled',
    companyName: n.companyName ?? null,
    location: n.location ?? null,
    remoteType: n.remoteType ?? null,
    employmentType: n.employmentType ?? null,
    description: d.pastedJd ?? n.descriptionMd ?? null,
    jdPasted: d.pastedJd !== null,
    salary: n.salary ?? null,
    structuredBenefits: {},
    techStack: Array.isArray(n.techStack) ? n.techStack.filter((t): t is string => typeof t === 'string') : [],
    url: n.applyUrl ?? null,
    href: `/discoveries/${d.id}`,
    reputation: await reputationFor(userId, company?.id ?? null),
  }
}

type AppRow = NonNullable<Awaited<ReturnType<typeof appsQ.getById>>>

function techOf(parsedMeta: unknown): string[] {
  const t = (parsedMeta as { tech_stack?: unknown } | null)?.tech_stack
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : []
}

async function fromApplication(userId: string, a: AppRow): Promise<OpportunityInput> {
  const j = a.job
  return {
    key: opportunityKey('application', a.id),
    kind: 'application',
    id: a.id,
    title: j.title,
    companyName: j.company?.name ?? null,
    location: j.location,
    remoteType: j.remoteType,
    employmentType: j.employmentType,
    description: j.descriptionMd,
    salary:
      j.salaryMin !== null || j.salaryMax !== null
        ? { min: j.salaryMin ?? undefined, max: j.salaryMax ?? undefined, currency: j.salaryCurrency ?? undefined }
        : null,
    structuredBenefits: j.benefits,
    techStack: techOf(j.parsedMeta),
    url: j.sourceUrl,
    href: `/applications/${a.id}`,
    reputation: await reputationFor(userId, j.companyId),
  }
}

/** Opportunities for "d:<uuid>" / "a:<uuid>" keys, in key order; unknown keys are skipped. */
export async function loadOpportunities(userId: string, keys: readonly string[]): Promise<OpportunityInput[]> {
  const parsed = keys.map(parseOpportunityKey).filter((p): p is NonNullable<typeof p> => p !== null)
  const dIds = parsed.filter((p) => p.kind === 'discovery').map((p) => p.id)
  const aIds = parsed.filter((p) => p.kind === 'application').map((p) => p.id)
  const [ds, as] = await Promise.all([
    cmpQ.discoveriesByIds(userId, dIds),
    Promise.all(aIds.map((id) => appsQ.getById(userId, id))),
  ])
  const byKey = new Map<string, OpportunityInput>()
  for (const d of ds) {
    const o = await fromDiscovery(userId, d)
    if (o) byKey.set(o.key, o)
  }
  for (const a of as) if (a) byKey.set(opportunityKey('application', a.id), await fromApplication(userId, a))
  return parsed.map((p) => byKey.get(opportunityKey(p.kind, p.id))).filter((o): o is OpportunityInput => o !== undefined)
}

/** Bound on one comparison batch (the shortlist factor compares 3 × N ≤ 30). */
export const MAX_COMPARE_KEYS = 30

export interface CompareData {
  settings: ComparisonSettings
  current: SideView | null
  comparisons: Comparison[]
}

/** Compare up to `max` opportunities with the current job. */
export async function compareKeys(userId: string, keys: readonly string[], now: Date = new Date()): Promise<CompareData> {
  const [settings, profile, opportunities] = await Promise.all([
    loadSettings(userId),
    loadProfileContext(userId),
    loadOpportunities(userId, keys.slice(0, MAX_COMPARE_KEYS)),
  ])
  const comparisons = opportunities.map((job) =>
    compareOpportunity({ job, current: settings.current, assumptions: settings.assumptions, profile, now }),
  )
  return {
    settings,
    current: currentSide(settings.current, defaultWeights(settings.current?.wantMore ?? [])),
    comparisons,
  }
}

export async function compareOne(userId: string, key: string, now: Date = new Date()): Promise<{ settings: ComparisonSettings; comparison: Comparison | null }> {
  const data = await compareKeys(userId, [key], now)
  return { settings: data.settings, comparison: data.comparisons[0] ?? null }
}

/**
 * The compact "vs current" chip per discovery (shortlist) or application
 * (Prepare). Empty when no current job is saved.
 */
export async function comparisonChips(userId: string, keys: readonly string[], now: Date = new Date()): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map()
  const settings = await loadSettings(userId)
  if (!settings.current) return new Map()
  const [profile, opportunities] = await Promise.all([loadProfileContext(userId), loadOpportunities(userId, keys)])
  return new Map(
    opportunities.map((job) => [
      job.key,
      compareOpportunity({ job, current: settings.current, assumptions: settings.assumptions, profile, now }).chip,
    ]),
  )
}

/** The opt-in shortlist factor is on and a current job is saved. */
export async function shortlistFactorOn(userId: string): Promise<boolean> {
  const row = await cmpQ.get(userId)
  return row.factorShortlist && parseCurrentJob(row.currentJob) !== null
}

/**
 * Optional shortlist factor (off by default): weighted total minus the
 * current job's, per discovery id. Empty unless the user opted in and saved
 * a current job; unknown totals are left out.
 */
export async function shortlistDeltas(userId: string, discoveryIds: readonly string[], now: Date = new Date()): Promise<Map<string, number>> {
  if (discoveryIds.length === 0 || !(await shortlistFactorOn(userId))) return new Map()
  const data = await compareKeys(userId, discoveryIds.map((id) => opportunityKey('discovery', id)), now)
  const base = data.current?.total.score ?? null
  const out = new Map<string, number>()
  if (base === null) return out
  for (const c of data.comparisons) {
    const s = c.job.total.score
    if (s !== null) out.set(c.key.slice(2), s - base)
  }
  return out
}
