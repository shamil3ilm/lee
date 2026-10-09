import type { ImportSource, ResumeProfile, Skill } from '@/lib/resume/types'
import type { FieldDiff } from './types'

/**
 * Client-safe, pure helpers the importers share when they write into the
 * master profile (only while profile editing in lee is on).
 */

export interface Provenance {
  source: ImportSource
  importedAt: string
}

/** Fields that differ, where the import has a value (an empty import never wipes mine). */
export function diffFields(rows: ReadonlyArray<readonly [field: string, label: string, mine: string, imported: string]>): FieldDiff[] {
  return rows
    .filter(([, , mine, imported]) => imported.trim() !== '' && imported.trim() !== mine.trim())
    .map(([field, label, mine, imported]) => ({ field, label, mine, imported }))
}

/** Append skills to the named group (created when missing), capped at 60 per group. */
export function addSkillsToGroup(profile: ResumeProfile, groupName: string, skills: readonly Skill[], makeId: () => string): ResumeProfile['skills'] {
  if (skills.length === 0) return profile.skills
  const existing = profile.skills.find((g) => g.name === groupName)
  if (existing) return profile.skills.map((g) => (g === existing ? { ...g, skills: [...g.skills, ...skills].slice(0, 60) } : g))
  return [...profile.skills, { id: makeId(), name: groupName, level: '', skills: skills.slice(0, 60), visibility: {} }]
}

/** The previous value of an item an import updated, for Undo. */
export interface UpdatedItem {
  section: 'work' | 'projects' | 'education' | 'certificates' | 'languages'
  id: string
  before: unknown
}
