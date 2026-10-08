import type { SkillGraph } from '@/lib/academy/content/graph'
import { matchSkills } from '@/lib/academy/placement/match'
import { contentStems, excerpt } from '@/lib/cv-score/text'
import { skillFamily, skillLabel } from '@/lib/discovery/match/lexicon'
import type { ChecklistItem, Gap } from './types'
import type { Unit } from './units'

/**
 * Missing requirements become GAPS, never CV content. Each offers:
 *   study   a study-list item (a "learning" skill in the profile, never shown
 *           on a CV) mapped to the Playground skills it matches;
 *   cover   "mention adjacent experience in the cover letter", offered only
 *           when a ready unit is genuinely adjacent (same skill family, or
 *           at least two content words shared), with that unit as source;
 *   ignore.
 * Pure: the Playground graph is passed in.
 */

function adjacentUnit(req: ChecklistItem, units: readonly Unit[]): Unit | undefined {
  const families = new Set(req.skills.map(skillFamily).filter((f): f is string => Boolean(f)))
  const family = units.find(
    (u) => u.mode === 'full' && [...u.skills].some((s) => !req.skills.includes(s) && families.has(skillFamily(s) ?? '')),
  )
  if (family) return family
  const want = contentStems(req.text)
  return units.find((u) => {
    if (u.ref.kind === 'skill') return false
    let shared = 0
    for (const s of contentStems(u.text)) if (want.has(s) && ++shared >= 2) return true
    return false
  })
}

export function studyLabelFor(req: Pick<ChecklistItem, 'skills' | 'text'>): string {
  if (req.skills.length > 0) return req.skills.slice(0, 2).map(skillLabel).join(' / ')
  return excerpt(req.text.replace(/[.;:]$/, ''), 60)
}

export function playgroundSkills(graph: SkillGraph | null, label: string, text: string): string[] {
  if (!graph) return []
  return matchSkills(graph, { terms: label.split(' / '), text }).flatMap((id) => {
    const s = graph.byId.get(id)
    return s ? [s.name] : []
  })
}

export function gapsFor(checklist: readonly ChecklistItem[], units: readonly Unit[], graph: SkillGraph | null): Gap[] {
  return checklist
    .filter((c) => c.status === 'missing')
    .map((req) => {
      const studyLabel = studyLabelFor(req)
      const adj = adjacentUnit(req, units)
      return {
        requirementId: req.id,
        text: req.text,
        weight: req.weight,
        studyLabel,
        playground: playgroundSkills(graph, studyLabel, req.text),
        adjacent: adj ? { text: excerpt(adj.text, 110), source: adj.ref } : null,
      }
    })
}
