import { canonicalSkill, skillsInText, withImplied } from '@/lib/discovery/match/lexicon'
import { checkDomainWording } from '@/lib/resume/fact-lock'
import { backedSkillIds, presentation, resolveHighlight } from '@/lib/resume/readiness'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import type { Recipe } from '@/lib/variants/types'
import type { VariantEvidence } from '../evidence'
import type { EvidenceRef } from './types'

/**
 * The master profile cut into PRESENTABLE units, each with its id: the
 * only things tailoring may ever show. Interview-ready items in any
 * fact-locked wording ("full"); domain-ready items only in their design
 * wording ("domain", which never backs a skill); backed skills. Learning
 * and AI-assisted items are not units at all, so no suggestion can reach
 * them. Pure.
 */

export interface Unit {
  ref: EvidenceRef
  text: string
  mode: 'full' | 'domain'
  /** Canonical skills it shows (empty for domain units). */
  skills: ReadonlySet<string>
}

function highlightUnits(list: readonly Highlight[], itemId: string, section: 'work' | 'projects'): Unit[] {
  return list.flatMap((h): Unit[] => {
    const r = resolveHighlight(h, null)
    if (!r || r.mode === 'override') return []
    const mode = r.mode === 'domain' ? 'domain' : 'full'
    return [{ ref: { kind: 'highlight', id: h.id, itemId, section }, text: r.text, mode, skills: mode === 'full' ? skillsInText(r.text) : new Set() }]
  })
}

export function profileUnits(profile: ResumeProfile): Unit[] {
  const out: Unit[] = []
  for (const w of profile.work) out.push(...highlightUnits(w.highlights, w.id, 'work'))
  for (const p of profile.projects) {
    const mode = presentation(p)
    if (mode === 'excluded' || mode === 'override') continue
    if (mode === 'full') {
      const text = `${p.name}${p.description ? `: ${p.description}` : ''}${p.keywords.length ? ` (${p.keywords.join(', ')})` : ''}`
      out.push({ ref: { kind: 'project', id: p.id, section: 'projects' }, text, mode: 'full', skills: skillsInText(text) })
    } else {
      const desc = checkDomainWording(p.description).ok ? p.description : ''
      out.push({ ref: { kind: 'project', id: p.id, section: 'projects' }, text: [p.name, desc].filter(Boolean).join(': '), mode: 'domain', skills: new Set() })
    }
    out.push(...highlightUnits(p.highlights, p.id, 'projects'))
  }
  const backed = backedSkillIds(profile)
  for (const g of profile.skills) {
    for (const s of g.skills) {
      if (!backed.has(s.id)) continue
      const c = canonicalSkill(s.name)
      out.push({ ref: { kind: 'skill', id: s.id }, text: s.name, mode: 'full', skills: new Set(c ? [c] : []) })
    }
  }
  return out
}

/** The units as coverage evidence (same shape the Match Score reads). */
export function unitsEvidence(units: readonly Unit[]): VariantEvidence {
  const skills = new Set<string>()
  for (const u of units) if (u.mode === 'full') for (const s of u.skills) skills.add(s)
  const skillNames = units.filter((u) => u.ref.kind === 'skill').map((u) => u.text)
  const lines = units.filter((u) => u.ref.kind !== 'skill').map((u) => u.text)
  if (skillNames.length > 0) lines.push(`Skills: ${skillNames.join(', ')}`)
  return { skills: withImplied(skills), evidence: lines }
}

/** Is this unit selected by the recipe? */
export function inRecipe(recipe: Recipe, ref: EvidenceRef): boolean {
  switch (ref.kind) {
    case 'skill':
      return recipe.skills.includes(ref.id)
    case 'project':
      return recipe.projects.some((p) => p.id === ref.id)
    case 'highlight': {
      const items = ref.section === 'projects' ? recipe.projects : recipe.work
      return items.some((i) => i.id === ref.itemId && i.highlights.some((h) => h.id === ref.id))
    }
  }
}

export function refKey(ref: EvidenceRef): string {
  return `${ref.kind}:${ref.id}`
}
