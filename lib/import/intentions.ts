import { z } from 'zod'
import type { Depth, ResumeProfile } from '@/lib/resume/types'

/**
 * Client-safe, pure. Readiness the user chose in an import review, kept as
 * an INTENTION keyed by name while public facts come from the portfolio
 * (canEditPublicFacts, lib/portfolio/lock.ts): when the item later arrives through the
 * portfolio sync, `applyReadinessIntentions` gives it the chosen flags.
 *
 * Only defensible claims: an imported item is "Not ready / learning"
 * (never in variants, tailoring or role suggestions) unless the user marked
 * it "Mine — I can explain it".
 */

export const INTENTION_SECTIONS = ['skills', 'projects', 'work'] as const
export type IntentionSection = (typeof INTENTION_SECTIONS)[number]

export const readinessIntentionSchema = z.object({
  section: z.enum(INTENTION_SECTIONS),
  /** Skill or project name; for work "<company> | <position>". */
  name: z.string().trim().min(1).max(300),
  mine: z.boolean(),
})
export type ReadinessIntention = z.infer<typeof readinessIntentionSchema>

export function readIntentions(value: unknown): ReadinessIntention[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v) => {
    const p = readinessIntentionSchema.safeParse(v)
    return p.success ? [p.data] : []
  })
}

export interface ReadinessFlags {
  depth: Depth
  interviewReady: boolean
  domainReady: boolean
}

/** The flags for an imported item: "Mine" → own and ready; otherwise learning, not ready. */
export function readinessFlags(mine: boolean): ReadinessFlags {
  return mine ? { depth: 'own', interviewReady: true, domainReady: true } : { depth: 'learning', interviewReady: false, domainReady: false }
}

export const nameKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function workName(company: string, position: string): string {
  return `${company} | ${position}`
}

function key(i: Pick<ReadinessIntention, 'section' | 'name'>): string {
  return `${i.section}:${i.section === 'work' ? i.name.split('|').map(nameKey).join('|') : nameKey(i.name)}`
}

/** Later intentions win (a newer import changed its mind). */
export function mergeIntentions(...lists: ReadonlyArray<readonly ReadinessIntention[]>): ReadinessIntention[] {
  const byKey = new Map<string, ReadinessIntention>()
  for (const list of lists) for (const i of list) byKey.set(key(i), i)
  return [...byKey.values()]
}

function profileKeys(profile: ResumeProfile): Set<string> {
  const keys = new Set<string>()
  for (const g of profile.skills) for (const s of g.skills) keys.add(key({ section: 'skills', name: s.name }))
  for (const p of profile.projects) keys.add(key({ section: 'projects', name: p.name }))
  for (const w of profile.work) keys.add(key({ section: 'work', name: workName(w.name, w.position) }))
  return keys
}

/** Intentions whose item is not in the profile (yet, or any more). */
export function pendingIntentions(profile: ResumeProfile, intentions: readonly ReadinessIntention[]): ReadinessIntention[] {
  const have = profileKeys(profile)
  return intentions.filter((i) => !have.has(key(i)))
}

/**
 * Give arrived items the readiness the user chose. Returns the new profile
 * and the intentions that matched (the caller drops those once saved).
 */
export function applyReadinessIntentions(
  profile: ResumeProfile,
  intentions: readonly ReadinessIntention[],
): { profile: ResumeProfile; applied: ReadinessIntention[] } {
  const byKey = new Map(intentions.map((i) => [key(i), i]))
  const applied = new Map<string, ReadinessIntention>()
  const flagsFor = (k: string): ReadinessFlags | null => {
    const i = byKey.get(k)
    if (!i) return null
    applied.set(k, i)
    return readinessFlags(i.mine)
  }
  const skills = profile.skills.map((g) => ({
    ...g,
    skills: g.skills.map((s) => {
      const f = flagsFor(key({ section: 'skills', name: s.name }))
      return f ? { ...s, ...f } : s
    }),
  }))
  const projects = profile.projects.map((p) => {
    const f = flagsFor(key({ section: 'projects', name: p.name }))
    return f ? { ...p, ...f } : p
  })
  const work = profile.work.map((w) => {
    const f = flagsFor(key({ section: 'work', name: workName(w.name, w.position) }))
    return f ? { ...w, highlights: w.highlights.map((h) => ({ ...h, ...f })) } : w
  })
  return { profile: { ...profile, skills, projects, work }, applied: [...applied.values()] }
}
