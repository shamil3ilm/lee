import { z } from 'zod'
import type { NewUserProfile } from '@/lib/db/queries/profile'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import type { ImportChanges } from '@/lib/import/changes'
import { readinessFlags, type ReadinessIntention } from '@/lib/import/intentions'
import { addSkillsToGroup, type Provenance } from '@/lib/import/resume-merge'
import type { ImportItem, ItemStatus, ReviewSelection } from '@/lib/import/types'
import { newId, type IdFactory } from '@/lib/resume/ids'
import { skillSchema, type ResumeProfile } from '@/lib/resume/types'

/**
 * Client-safe, pure. The CV / profile-markdown import as review items: the
 * AI parse is a SUGGESTION, confirmed item by item.
 *   basics    headline and summary (public)
 *   skills    chips with readiness (public)
 *   matching  industries, kinds of role, seniority and years — lee-only
 *             matching data, saved in both edit modes
 * Skill stack weights are kept only for skills marked "Mine".
 */

export const CV_SKILL_GROUP = 'From CV'

export const cvProposalSchema = z.object({
  headline: z.string().max(300).nullable(),
  summary: z.string().max(4000).nullable(),
  skills: z.array(z.string().max(80)).max(60),
  industries: z.array(z.string().max(80)).max(20),
  roleTypes: z.array(z.string().max(80)).max(20),
  seniority: z.string().max(80).nullable(),
  yearsExperience: z.number().int().min(0).max(60).nullable(),
  stackWeights: z.record(z.string().max(80), z.number()).default({}),
})
export type CvProposal = z.infer<typeof cvProposalSchema>

export interface CvImportContext {
  headline: string | null
  summaryMd: string | null
  skills: readonly string[]
  industries: readonly string[]
  roleTypes: readonly string[]
  seniority: string | null
  yearsExperience: number | null
  stackWeights: Readonly<Record<string, number>>
  resume: ResumeProfile
}

const norm = (s: string): string => normalizeForMatch(s)

export function cvProposalFrom(parsed: {
  headline?: string | null
  summary_md?: string | null
  skills?: string[]
  industries?: string[]
  role_types?: string[]
  seniority?: string | null
  years_experience?: number | null
  stack_weights?: Record<string, number>
}): CvProposal {
  const uniq = (xs: readonly string[] | undefined, cap: number): string[] => {
    const seen = new Set<string>()
    return (xs ?? []).map((x) => x.trim().slice(0, 80)).filter((x) => x && !seen.has(norm(x)) && seen.add(norm(x))).slice(0, cap)
  }
  const years = parsed.years_experience
  return cvProposalSchema.parse({
    headline: parsed.headline?.trim().slice(0, 300) || null,
    summary: parsed.summary_md?.trim().slice(0, 4000) || null,
    skills: uniq(parsed.skills, 60),
    industries: uniq(parsed.industries, 20),
    roleTypes: uniq(parsed.role_types, 20),
    seniority: parsed.seniority?.trim().slice(0, 80) || null,
    yearsExperience: typeof years === 'number' && years >= 0 && years <= 60 ? Math.round(years) : null,
    stackWeights: Object.fromEntries(Object.entries(parsed.stack_weights ?? {}).filter(([k, v]) => k.length <= 80 && Number.isFinite(v)).slice(0, 60)),
  })
}

function single(key: string, section: ImportItem['section'], label: string, mine: string | null, imported: string | null, isPublic: boolean, json: ImportItem['json']): ImportItem[] {
  if (!imported) return []
  const status: ItemStatus = !mine ? 'new' : mine.trim() === imported.trim() ? 'duplicate' : 'update'
  const diff = status === 'update' ? [{ field: key, label, mine: mine ?? '', imported }] : []
  return [{ key, section, label, detail: status === 'update' ? '' : imported, status, diff, hasReadiness: false, isPublic, json }]
}

function chips(prefix: string, section: ImportItem['section'], names: readonly string[], have: ReadonlySet<string>, readiness: boolean, json: (n: string) => ImportItem['json'], detail = ''): ImportItem[] {
  return names.map((n, i) => {
    const dup = have.has(norm(n))
    return { key: `${prefix}:${i}`, section, label: n, detail, status: dup ? 'duplicate' : 'new', diff: [], hasReadiness: readiness && !dup, isPublic: section !== 'matching', json: json(n) }
  })
}

export function buildCvImportItems(p: CvProposal, ctx: CvImportContext): ImportItem[] {
  const skillsHave = new Set([...ctx.skills, ...ctx.resume.skills.flatMap((g) => g.skills.map((s) => s.name))].map(norm))
  return [
    ...single('basics:headline', 'basics', 'Headline', ctx.headline, p.headline, true, p.headline ? { path: 'basics.label', value: p.headline } : null),
    ...single('basics:summary', 'basics', 'Summary', ctx.summaryMd, p.summary, true, p.summary ? { path: 'basics.summary', value: p.summary } : null),
    ...chips('skills', 'skills', p.skills, skillsHave, true, (n) => ({ path: 'skills', value: n })),
    ...chips('industries', 'matching', p.industries, new Set(ctx.industries.map(norm)), false, () => null, 'Industry'),
    ...chips('roleTypes', 'matching', p.roleTypes, new Set(ctx.roleTypes.map(norm)), false, () => null, 'Kind of role'),
    ...single('matching:seniority', 'matching', 'Seniority', ctx.seniority, p.seniority, false, null),
    ...single('matching:years', 'matching', 'Years of experience', ctx.yearsExperience?.toString() ?? null, p.yearsExperience?.toString() ?? null, false, null),
  ]
}

export interface CvApplyResult {
  patch: Partial<NewUserProfile>
  resume: ResumeProfile | null
  intentions: ReadinessIntention[]
  changes: ImportChanges
  counts: Record<string, number>
}

/** Apply a confirmed CV review; public facts only when `editable`. */
export function applyCvSelection(
  ctx: CvImportContext,
  p: CvProposal,
  items: readonly ImportItem[],
  sel: ReviewSelection,
  prov: Provenance,
  editable: boolean,
  makeId: IdFactory = () => newId(),
): CvApplyResult {
  const on = new Set(sel.picked)
  const mine = new Set(sel.mine)
  const picked = items.filter((i) => on.has(i.key) && i.status !== 'duplicate')
  const take = (key: string): boolean => picked.some((i) => i.key === key)
  const names = (prefix: string): string[] => picked.filter((i) => i.key.startsWith(`${prefix}:`)).map((i) => i.label)
  const patch: Partial<NewUserProfile> = {}
  const changes: ImportChanges = {}
  const counts: Record<string, number> = {}

  // Lee-only matching data: saved in both modes.
  const industries = names('industries')
  if (industries.length) {
    changes.industriesAdded = industries
    patch.industries = [...ctx.industries, ...industries]
  }
  const roleTypes = names('roleTypes')
  if (roleTypes.length) {
    changes.roleTypesAdded = roleTypes
    patch.roleTypes = [...ctx.roleTypes, ...roleTypes]
  }
  if (take('matching:seniority') && p.seniority) {
    changes.seniority = { before: ctx.seniority, after: p.seniority }
    patch.seniority = p.seniority
  }
  if (take('matching:years') && p.yearsExperience !== null) {
    changes.yearsExperience = { before: ctx.yearsExperience, after: p.yearsExperience }
    patch.yearsExperience = p.yearsExperience
  }
  const skillPicks = picked.filter((i) => i.section === 'skills').map((i) => ({ name: i.label, mine: mine.has(i.key) }))
  const readyNames = skillPicks.filter((s) => s.mine).map((s) => s.name)
  const weights = Object.entries(p.stackWeights).filter(([k]) => readyNames.some((n) => norm(n) === norm(k)) && !(k in ctx.stackWeights))
  if (weights.length) {
    changes.stackWeightsAdded = weights.map(([k]) => k)
    patch.stackWeights = { ...ctx.stackWeights, ...Object.fromEntries(weights) } as NewUserProfile['stackWeights']
  }
  counts.matching = picked.filter((i) => i.section === 'matching').length

  if (!editable) {
    counts.suggested = picked.filter((i) => i.isPublic).length
    return { patch, resume: null, intentions: skillPicks.map((s) => ({ section: 'skills' as const, ...s })), changes, counts }
  }
  if (take('basics:headline') && p.headline) {
    changes.headline = { before: ctx.headline, after: p.headline }
    patch.headline = p.headline
  }
  if (take('basics:summary') && p.summary) {
    changes.summaryMd = { before: ctx.summaryMd, after: p.summary }
    patch.summaryMd = p.summary
  }
  if (readyNames.length) {
    changes.skillsAdded = readyNames
    patch.skills = [...ctx.skills, ...readyNames]
  }
  const skills = skillPicks.map((s) => skillSchema.parse({ id: makeId(), ...prov, name: s.name, ...readinessFlags(s.mine) }))
  if (skills.length) counts.skills = skills.length
  const resume = skills.length ? { ...ctx.resume, skills: addSkillsToGroup(ctx.resume, CV_SKILL_GROUP, skills, makeId) } : null
  return { patch, resume, intentions: [], changes, counts }
}
