import { newId, type IdFactory } from '@/lib/resume/ids'
import type { ResumeProfile } from '@/lib/resume/types'

/**
 * Gaps → the study list. A study item is a LEARNING skill in the master
 * profile (depth "learning", not interview- or domain-ready), so it is
 * never shown on a CV, never counts as evidence, and appears in Settings ›
 * Study list and the Playground's daily plan (mapped to Playground skills
 * by name). Pure.
 */

export const STUDY_GROUP = 'Study list'
const MAX_LABEL = 120

export type StudyAdd =
  | { ok: true; profile: ResumeProfile; skillId: string; created: boolean }
  | { ok: false; error: string }

export function addStudySkill(
  profile: ResumeProfile,
  label: string,
  notes: string,
  makeId: IdFactory = () => newId('sk'),
): StudyAdd {
  const name = label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)
  if (!name) return { ok: false, error: 'Nothing to add.' }
  for (const g of profile.skills) {
    const hit = g.skills.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (!hit) continue
    // Already ready: it is evidence, not a gap. Already studying: nothing to do.
    if (hit.interviewReady) return { ok: false, error: `${hit.name} is already a ready skill in your profile.` }
    return { ok: true, profile, skillId: hit.id, created: false }
  }
  const skill = {
    id: makeId(),
    name,
    kind: 'tech' as const,
    depth: 'learning' as const,
    interviewReady: false,
    domainReady: false,
    ownedAspects: '',
    studyNotes: notes.slice(0, 1000),
    studyTarget: '',
  }
  const group = profile.skills.find((g) => g.name === STUDY_GROUP)
  if (!group && profile.skills.length >= 30) return { ok: false, error: 'Your profile has the most skill groups it can hold.' }
  if (group && group.skills.length >= 60) return { ok: false, error: 'Your study list group is full.' }
  const skills = group
    ? profile.skills.map((g) => (g.id === group.id ? { ...g, skills: [...g.skills, skill] } : g))
    : [...profile.skills, { id: newId('g'), name: STUDY_GROUP, level: '', skills: [skill], visibility: {} }]
  return { ok: true, profile: { ...profile, skills }, skillId: skill.id, created: true }
}

export interface RecurringGap {
  label: string
  count: number
}

/** "Kubernetes (required)" → "Kubernetes"; top recurring missing must-haves, most frequent first. */
export function recurringGaps(missing: ReadonlyArray<readonly string[]>, top = 6): RecurringGap[] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const list of missing) {
    const seen = new Set<string>()
    for (const raw of list) {
      const label = raw.replace(/\s*\((?:required|must)\)\s*$/i, '').trim()
      const key = label.toLowerCase()
      if (!label || seen.has(key)) continue
      seen.add(key)
      const prev = counts.get(key)
      counts.set(key, { label: prev?.label ?? label, count: (prev?.count ?? 0) + 1 })
    }
  }
  return [...counts.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, top)
}
