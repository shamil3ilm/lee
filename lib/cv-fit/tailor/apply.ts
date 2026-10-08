import { resolveHighlight } from '@/lib/resume/readiness'
import type { ResumeProfile } from '@/lib/resume/types'
import type { ItemPick, Recipe, SectionKey } from '@/lib/variants/types'
import type { EvidenceRef, Suggestion } from './types'

/**
 * Accepted suggestions → a new recipe (immutable). A recipe holds no facts:
 * it selects, orders and picks wordings, and `renderVariant` re-applies
 * every readiness and fact-lock rule to the result. So whatever is
 * accepted, the tailored CV can only show presentable profile content.
 * `wordingIds` maps a highlight to the id its accepted AI wording got once
 * it joined the master profile as an approved alternate.
 */

type Items = Recipe['work']

function withSection(sections: readonly SectionKey[], key: SectionKey): SectionKey[] {
  return sections.includes(key) ? [...sections] : [...sections, key]
}

function pickFront(item: ItemPick, highlightId: string): ItemPick {
  const rest = item.highlights.filter((h) => h.id !== highlightId)
  const existing = item.highlights.find((h) => h.id === highlightId)
  return { ...item, highlights: [existing ?? { id: highlightId, wordingId: null }, ...rest] }
}

function profileOrder(profile: ResumeProfile, section: 'work' | 'projects'): Map<string, number> {
  const list = section === 'work' ? profile.work : profile.projects
  return new Map(list.map((x, i) => [x.id, i] as const))
}

function includeHighlight(profile: ResumeProfile, items: Items, ref: EvidenceRef, section: 'work' | 'projects'): Items {
  const itemId = ref.itemId
  if (!itemId) return items
  if (items.some((i) => i.id === itemId)) return items.map((i) => (i.id === itemId ? pickFront(i, ref.id) : i))
  const added = [...items, { id: itemId, highlights: [{ id: ref.id, wordingId: null }] }]
  // Jobs keep the profile's (reverse-chronological) order; a project leads.
  if (section === 'projects') return [added[added.length - 1]!, ...items]
  const order = profileOrder(profile, 'work')
  return added.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
}

function includeProject(profile: ResumeProfile, items: Items, id: string): Items {
  if (items.some((i) => i.id === id)) return items
  const p = profile.projects.find((x) => x.id === id)
  if (!p) return items
  const highlights = p.highlights.filter((h) => resolveHighlight(h, null) !== null).slice(0, 2).map((h) => ({ id: h.id, wordingId: null }))
  return [{ id, highlights }, ...items]
}

function setWording(items: Items, highlightId: string, wordingId: string): Items {
  return items.map((i) => ({ ...i, highlights: i.highlights.map((h) => (h.id === highlightId ? { ...h, wordingId } : h)) }))
}

function applyOne(profile: ResumeProfile, r: Recipe, s: Suggestion, wordingIds: ReadonlyMap<string, string>): Recipe {
  switch (s.kind) {
    case 'include': {
      const { ref } = s
      if (ref.kind === 'skill') return r.skills.includes(ref.id) ? r : { ...r, skills: [ref.id, ...r.skills], sections: withSection(r.sections, 'skills') }
      if (ref.kind === 'project') return { ...r, projects: includeProject(profile, r.projects, ref.id), sections: withSection(r.sections, 'projects') }
      return ref.section === 'projects'
        ? { ...r, projects: includeHighlight(profile, r.projects, ref, 'projects'), sections: withSection(r.sections, 'projects') }
        : { ...r, work: includeHighlight(profile, r.work, ref, 'work'), sections: withSection(r.sections, 'work') }
    }
    case 'lead_bullet': {
      const key = s.ref.section === 'projects' ? 'projects' : 'work'
      return { ...r, [key]: r[key].map((i) => (i.id === s.ref.itemId ? pickFront(i, s.ref.id) : i)) }
    }
    case 'lead_skills':
      return { ...r, skills: [...s.skillIds.filter((id) => r.skills.includes(id)), ...r.skills.filter((id) => !s.skillIds.includes(id))] }
    case 'swap_wording':
      return { ...r, work: setWording(r.work, s.highlightId, s.wordingId), projects: setWording(r.projects, s.highlightId, s.wordingId) }
    case 'ai_wording': {
      const id = wordingIds.get(s.highlightId)
      return id ? { ...r, work: setWording(r.work, s.highlightId, id), projects: setWording(r.projects, s.highlightId, id) } : r
    }
    case 'headline':
      return { ...r, headline: s.text }
    case 'summary':
      return { ...r, summary: s.text }
    case 'trim':
      return dropRefs(r, s.drops.map((d) => d.ref))
  }
}

export function dropRefs(r: Recipe, refs: readonly EvidenceRef[]): Recipe {
  const skills = new Set(refs.filter((x) => x.kind === 'skill').map((x) => x.id))
  const projects = new Set(refs.filter((x) => x.kind === 'project').map((x) => x.id))
  const highlights = new Set(refs.filter((x) => x.kind === 'highlight').map((x) => x.id))
  const strip = (items: Items): Items => items.map((i) => ({ ...i, highlights: i.highlights.filter((h) => !highlights.has(h.id)) }))
  return {
    ...r,
    skills: r.skills.filter((id) => !skills.has(id)),
    projects: strip(r.projects).filter((p) => !projects.has(p.id)),
    work: strip(r.work),
  }
}

/** Order matters only for trim, which acts on the result of the others: it runs last. */
export function applySuggestions(
  profile: ResumeProfile,
  recipe: Recipe,
  accepted: readonly Suggestion[],
  wordingIds: ReadonlyMap<string, string> = new Map(),
): Recipe {
  const ordered = [...accepted.filter((s) => s.kind !== 'trim'), ...accepted.filter((s) => s.kind === 'trim')]
  return ordered.reduce((r, s) => applyOne(profile, r, s, wordingIds), recipe)
}
