import type { Depth } from '@/lib/resume/types'
import { READY_SUGGESTION_LEVEL, levelName } from '@/lib/academy/levels'
import type { EvidenceUnit } from './evidence'

/**
 * The profile's study list (ai_assisted / learning items that are not
 * interview-ready yet) mapped onto Playground skills. Targets feed the daily
 * plan, prioritised by target date. Marking an item interview-ready stays
 * the user's decision: the Playground only SUGGESTS it once the mapped skill
 * reaches Competent, and never writes the flag. Pure.
 */

export interface StudyTarget {
  skillId: string
  /** The profile item (skill, project or highlight) id. */
  studyItemId: string
  label: string
  context: string
  depth: Depth
  notes: string
  /** YYYY-MM-DD, YYYY-MM or YYYY; '' when the user set none. */
  targetDate: string
}

export interface UnmappedStudyItem {
  studyItemId: string
  label: string
  context: string
  depth: Depth
}

export function studyTargetsFrom(
  matches: ReadonlyArray<{ unit: EvidenceUnit; skillIds: readonly string[] }>,
): { targets: StudyTarget[]; unmapped: UnmappedStudyItem[] } {
  const targets: StudyTarget[] = []
  const unmapped: UnmappedStudyItem[] = []
  const seen = new Set<string>()
  for (const { unit: u, skillIds } of matches) {
    if (skillIds.length === 0) {
      unmapped.push({ studyItemId: u.id, label: u.studyLabel, context: u.context, depth: u.depth })
      continue
    }
    for (const skillId of skillIds) {
      const key = `${u.id}:${skillId}`
      if (seen.has(key)) continue
      seen.add(key)
      targets.push({
        skillId,
        studyItemId: u.id,
        label: u.studyLabel,
        context: u.context,
        depth: u.depth,
        notes: u.notes,
        targetDate: u.targetDate,
      })
    }
  }
  return { targets, unmapped }
}

/** A partial date as the last day it can mean ("2026-11" → "2026-11-30"), or null. */
export function targetDay(target: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(target)) return target
  if (/^\d{4}-\d{2}$/.test(target)) {
    const [y, m] = target.split('-').map(Number) as [number, number]
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return `${target}-${String(last).padStart(2, '0')}`
  }
  if (/^\d{4}$/.test(target)) return `${target}-12-31`
  return null
}

/** Earliest target first; undated targets last; profile order breaks ties. */
export function byTargetDate(a: StudyTarget, b: StudyTarget): number {
  const da = targetDay(a.targetDate)
  const db = targetDay(b.targetDate)
  if (da && db) return da.localeCompare(db)
  if (da) return -1
  if (db) return 1
  return 0
}

export interface ReadySuggestion {
  studyItemId: string
  skillId: string
  label: string
  message: string
}

/** Study items whose mapped skill reached Competent: suggest, never set. */
export function readySuggestions(
  targets: readonly StudyTarget[],
  levels: ReadonlyMap<string, number>,
  skillName: (id: string) => string = (id) => id,
): ReadySuggestion[] {
  const seen = new Set<string>()
  const out: ReadySuggestion[] = []
  for (const t of targets) {
    const level = levels.get(t.skillId) ?? 0
    if (level < READY_SUGGESTION_LEVEL || seen.has(t.studyItemId)) continue
    seen.add(t.studyItemId)
    const name = skillName(t.skillId)
    out.push({
      studyItemId: t.studyItemId,
      skillId: t.skillId,
      label: t.label,
      message: `You're ${levelName(level)} in ${name === t.skillId ? t.label : name}. If you can now explain "${t.label}" yourself, you could mark it interview-ready in your study list.`,
    })
  }
  return out
}
