import type { ResumeProfile } from '@/lib/resume/types'
import { readyHighlights } from '@/lib/resume/readiness'
import { SECTION_KEYS, type ItemPick, type Recipe, type SectionKey } from './types'

/** Immutable recipe edits used by the variant editor. Pure and client-safe. */

export type PickSection = 'work' | 'projects'
export type IdSection = 'skills' | 'education' | 'languages' | 'certificates'

function swap<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

/** Master order of an item section, so a re-added item returns to its place. */
function masterOrder(profile: ResumeProfile, section: PickSection): string[] {
  return (section === 'work' ? profile.work : profile.projects).map((x) => x.id)
}

export function toggleItem(recipe: Recipe, profile: ResumeProfile, section: PickSection, id: string, on: boolean): Recipe {
  const picks = recipe[section]
  if (!on) return { ...recipe, [section]: picks.filter((p) => p.id !== id) }
  if (picks.some((p) => p.id === id)) return recipe
  const source = section === 'work' ? profile.work : profile.projects
  const item = source.find((x) => x.id === id)
  const fresh: ItemPick = { id, highlights: readyHighlights(item?.highlights ?? []).map((h) => ({ id: h.id, wordingId: null })) }
  const order = masterOrder(profile, section)
  const next = [...picks, fresh].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  return { ...recipe, [section]: next }
}

function mapPick(recipe: Recipe, section: PickSection, id: string, fn: (p: ItemPick) => ItemPick): Recipe {
  return { ...recipe, [section]: recipe[section].map((p) => (p.id === id ? fn(p) : p)) }
}

export function toggleHighlight(recipe: Recipe, section: PickSection, itemId: string, highlightId: string, on: boolean): Recipe {
  return mapPick(recipe, section, itemId, (p) => {
    const has = p.highlights.some((h) => h.id === highlightId)
    if (on === has) return p
    return { ...p, highlights: on ? [...p.highlights, { id: highlightId, wordingId: null }] : p.highlights.filter((h) => h.id !== highlightId) }
  })
}

export function setWording(recipe: Recipe, section: PickSection, itemId: string, highlightId: string, wordingId: string | null): Recipe {
  return mapPick(recipe, section, itemId, (p) => ({
    ...p,
    highlights: p.highlights.map((h) => (h.id === highlightId ? { ...h, wordingId } : h)),
  }))
}

export function moveHighlight(recipe: Recipe, section: PickSection, itemId: string, highlightId: string, dir: -1 | 1): Recipe {
  return mapPick(recipe, section, itemId, (p) => ({ ...p, highlights: swap(p.highlights, p.highlights.findIndex((h) => h.id === highlightId), dir) }))
}

export function moveItem(recipe: Recipe, section: PickSection, id: string, dir: -1 | 1): Recipe {
  return { ...recipe, [section]: swap(recipe[section], recipe[section].findIndex((p) => p.id === id), dir) }
}

export function toggleId(recipe: Recipe, section: IdSection, id: string, on: boolean): Recipe {
  const list = recipe[section]
  if (on === list.includes(id)) return recipe
  return { ...recipe, [section]: on ? [...list, id] : list.filter((x) => x !== id) }
}

/** Explicitly include (or stop including) a not-ready ai_assisted item. */
export function toggleOverride(recipe: Recipe, id: string, on: boolean): Recipe {
  return { ...recipe, overrides: on ? [...new Set([...recipe.overrides, id])] : recipe.overrides.filter((x) => x !== id) }
}

export function toggleSection(recipe: Recipe, key: SectionKey, on: boolean): Recipe {
  if (on === recipe.sections.includes(key)) return recipe
  if (!on) return { ...recipe, sections: recipe.sections.filter((k) => k !== key) }
  return { ...recipe, sections: [...recipe.sections, key] }
}

export function moveSection(recipe: Recipe, key: SectionKey, dir: -1 | 1): Recipe {
  return { ...recipe, sections: swap(recipe.sections, recipe.sections.indexOf(key), dir) }
}

/** Sections in display order: included ones first (in order), then the rest. */
export function sectionRows(recipe: Recipe): Array<{ key: SectionKey; on: boolean }> {
  return [
    ...recipe.sections.map((key) => ({ key, on: true })),
    ...SECTION_KEYS.filter((k) => !recipe.sections.includes(k)).map((key) => ({ key, on: false })),
  ]
}
