import { excerpt } from '@/lib/cv-score/text'
import type { JdLine, ParsedJd } from '@/lib/discovery/match/jd'
import { skillLabel, withImplied } from '@/lib/discovery/match/lexicon'
import { creditFor } from '@/lib/discovery/match/skills'
import { effectiveWording } from '@/lib/resume/wordings'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import type { Recipe } from '@/lib/variants/types'
import { requirementId } from './checklist'
import type { ChecklistItem, EvidenceRef, Suggestion } from './types'
import { inRecipe, refKey, type Unit } from './units'
import { addedTerms, jdTerms, termScore, usableAlternates } from './wording'

/**
 * Suggestions for met and partial requirements. Each one only selects,
 * orders or re-words ready profile content:
 *   include       a ready unit backs the requirement but is not on this CV
 *                 (for a partial: the related ready skill, e.g. MySQL ≈ PostgreSQL)
 *   lead_bullet   move the evidence bullet to the top of its job / project
 *   lead_skills   put the skills the JD asks for first
 *   swap_wording  an APPROVED alternate of the same highlight that uses more
 *                 of the JD's terms (and passes the number / domain locks)
 * Missing requirements get no suggestion (./gaps.ts). Pure.
 */

export interface SuggestInput {
  profile: ResumeProfile
  recipe: Recipe
  units: readonly Unit[]
  checklist: readonly ChecklistItem[]
  jd: ParsedJd
}

function short(text: string): string {
  return excerpt(text, 60)
}

function itemName(profile: ResumeProfile, ref: EvidenceRef): string {
  const id = ref.itemId ?? ref.id
  return profile.work.find((w) => w.id === id)?.name ?? profile.projects.find((p) => p.id === id)?.name ?? 'this item'
}

function findHighlight(profile: ResumeProfile, id: string): Highlight | undefined {
  for (const w of profile.work) for (const h of w.highlights) if (h.id === id) return h
  for (const p of profile.projects) for (const h of p.highlights) if (h.id === id) return h
  return undefined
}

function jdLine(jd: ParsedJd, id: string): JdLine | undefined {
  return [...jd.must, ...jd.nice].find((l) => requirementId(l.text) === id)
}

function includes(input: SuggestInput, served: readonly ChecklistItem[]): Suggestion[] {
  const byRef = new Map<string, { unit: Unit; reqs: ChecklistItem[]; related: boolean }>()
  const add = (unit: Unit, req: ChecklistItem, related: boolean): void => {
    if (inRecipe(input.recipe, unit.ref)) return
    const k = refKey(unit.ref)
    const prev = byRef.get(k)
    if (prev) prev.reqs.push(req)
    else byRef.set(k, { unit, reqs: [req], related })
  }
  for (const req of served) {
    const source = req.source ? input.units.find((u) => refKey(u.ref) === refKey(req.source!)) : undefined
    if (source && req.inCv !== 'met') add(source, req, false)
    if (req.status !== 'partial') continue
    // Partial: surface the related ready skill (a close sibling or concept).
    const line = jdLine(input.jd, req.id)
    for (const u of input.units) {
      if (u.ref.kind !== 'skill' || !line) continue
      if (line.skills.some((s) => creditFor(s, withImplied(u.skills)).credit > 0)) add(u, req, true)
    }
  }
  return [...byRef.values()].map(({ unit, reqs, related }) => ({
    id: `include:${refKey(unit.ref)}`,
    kind: 'include' as const,
    requirementIds: reqs.map((r) => r.id),
    ref: unit.ref,
    text: unit.text,
    reason: related
      ? `Related ready skill for "${short(reqs[0]!.text)}"`
      : `Backs "${short(reqs[0]!.text)}": ready in your profile but not on this CV`,
  }))
}

function leadBullets(input: SuggestInput, served: readonly ChecklistItem[]): Suggestion[] {
  const out = new Map<string, Suggestion>()
  for (const req of served) {
    const ref = req.source
    if (!ref || ref.kind !== 'highlight' || !inRecipe(input.recipe, ref)) continue
    const items = ref.section === 'projects' ? input.recipe.projects : input.recipe.work
    const item = items.find((i) => i.id === ref.itemId)
    if (!item || item.highlights[0]?.id === ref.id) continue
    const prev = out.get(ref.id)
    if (prev) {
      prev.requirementIds.push(req.id)
      continue
    }
    out.set(ref.id, {
      id: `lead:${ref.id}`,
      kind: 'lead_bullet',
      requirementIds: [req.id],
      ref: { ...ref, kind: 'highlight' },
      text: req.evidence ?? '',
      reason: `Leads ${itemName(input.profile, ref)} with the evidence for "${short(req.text)}"`,
    })
  }
  return [...out.values()]
}

function leadSkills(input: SuggestInput, served: readonly ChecklistItem[]): Suggestion[] {
  const asked = new Map<string, string[]>()
  for (const req of served) for (const s of req.skills) asked.set(s, [...(asked.get(s) ?? []), req.id])
  const skillUnits = input.units.filter((u) => u.ref.kind === 'skill' && input.recipe.skills.includes(u.ref.id))
  const lead = skillUnits.filter((u) => [...asked.keys()].some((s) => creditFor(s, withImplied(u.skills)).credit > 0))
  if (lead.length === 0) return []
  const ids = lead.map((u) => u.ref.id)
  if (input.recipe.skills.slice(0, ids.length).every((id) => ids.includes(id))) return []
  const reqIds = [...new Set(lead.flatMap((u) => [...asked].filter(([s]) => creditFor(s, withImplied(u.skills)).credit > 0).flatMap(([, r]) => r)))]
  return [
    {
      id: 'lead:skills',
      kind: 'lead_skills',
      requirementIds: reqIds,
      skillIds: ids,
      names: lead.map((u) => u.text),
      reason: `Puts ${lead.map((u) => u.text).slice(0, 4).join(', ')} first: the JD asks for them`,
    },
  ]
}

function swaps(input: SuggestInput): Suggestion[] {
  const terms = jdTerms(input.jd)
  const out: Suggestion[] = []
  const picks = [...input.recipe.work, ...input.recipe.projects].flatMap((i) => i.highlights)
  for (const pick of picks) {
    const h = findHighlight(input.profile, pick.id)
    if (!h) continue
    const current = effectiveWording(h, pick.wordingId).text
    const now = termScore(current, terms)
    const best = usableAlternates(h)
      .filter((a) => a.id !== pick.wordingId && a.text !== current)
      .map((a) => ({ a, score: termScore(a.text, terms) }))
      .sort((x, y) => y.score - x.score)[0]
    if (!best || best.score <= now) continue
    const added = addedTerms(best.a.text, current, terms)
    const reqIds = input.checklist
      .filter((c) => c.status !== 'missing')
      .filter((c) => c.skills.some((s) => added.includes(skillLabel(s))) || added.some((t) => c.text.toLowerCase().includes(t.toLowerCase())))
      .map((c) => c.id)
    out.push({
      id: `swap:${h.id}:${best.a.id}`,
      kind: 'swap_wording',
      requirementIds: reqIds,
      highlightId: h.id,
      wordingId: best.a.id,
      from: current,
      text: best.a.text,
      reason: `An approved wording of the same fact in the JD's terms${added.length ? ` (${added.join(', ')})` : ''}`,
    })
  }
  return out
}

export function suggestForCoverage(input: SuggestInput): Suggestion[] {
  const served = input.checklist.filter((c) => c.status === 'met' || c.status === 'partial')
  return [...includes(input, served), ...leadBullets(input, served), ...leadSkills(input, served), ...swaps(input)]
}
