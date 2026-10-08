import type { ParsedJd } from '@/lib/discovery/match/jd'
import { canonicalSkill } from '@/lib/discovery/match/lexicon'
import { effectiveWording } from '@/lib/resume/wordings'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import { renderVariant } from '@/lib/variants/render'
import type { Recipe, Region } from '@/lib/variants/types'
import { dropRefs } from './apply'
import type { ChecklistItem, EvidenceRef } from './types'
import { refKey } from './units'
import { jdTerms, termScore } from './wording'

/**
 * Trim to the region's page target by dropping the LOWEST-relevance lines:
 * bullets that back no met / partial requirement, scored by how many of the
 * JD's terms they use; then skills the JD does not ask for. Every job keeps
 * at least one bullet; a project left with none is dropped whole. Trimming
 * only removes, never adds.
 *
 * Page targets: the variant's own length (1 or 2 pages) in the GCC and
 * India, where 1–2 pages is normal; Remote / US / EU expects one page under
 * five years of experience.
 */

export const PAGE_SLACK = 0.15
const MAX_STEPS = 40

export function pageTarget(region: Region, lengthTarget: 1 | 2, years: number | null): 1 | 2 {
  if (region === 'remote' && (years ?? 0) < 5) return 1
  return lengthTarget
}

interface Candidate {
  ref: EvidenceRef
  text: string
  score: number
  /** Later lines go first among equals. */
  order: number
}

function findHighlight(profile: ResumeProfile, id: string): Highlight | undefined {
  for (const w of profile.work) for (const h of w.highlights) if (h.id === id) return h
  for (const p of profile.projects) for (const h of p.highlights) if (h.id === id) return h
  return undefined
}

function candidates(profile: ResumeProfile, recipe: Recipe, keep: ReadonlySet<string>, jd: ParsedJd): Candidate[] {
  const terms = jdTerms(jd)
  const out: Candidate[] = []
  let order = 0
  for (const [section, items] of [['work', recipe.work], ['projects', recipe.projects]] as const) {
    for (const item of items) {
      item.highlights.forEach((pick, i) => {
        order++
        const ref: EvidenceRef = { kind: 'highlight', id: pick.id, itemId: item.id, section }
        if (keep.has(refKey(ref))) return
        // A job keeps its first bullet.
        if (section === 'work' && i === 0 && item.highlights.length === 1) return
        const h = findHighlight(profile, pick.id)
        if (!h) return
        const text = effectiveWording(h, pick.wordingId).text
        out.push({ ref, text, score: termScore(text, terms), order })
      })
    }
  }
  const stack = new Set(jd.stack)
  const all = profile.skills.flatMap((g) => g.skills)
  recipe.skills.forEach((id, i) => {
    const s = all.find((x) => x.id === id)
    const ref: EvidenceRef = { kind: 'skill', id }
    if (!s || keep.has(refKey(ref))) return
    const c = canonicalSkill(s.name)
    if (c && stack.has(c)) return
    // Skills come after bullets: a lone skill name is cheap to keep.
    out.push({ ref, text: s.name, score: 0.5, order: 1000 + i })
  })
  return out.sort((a, b) => a.score - b.score || b.order - a.order)
}

export interface TrimResult {
  recipe: Recipe
  drops: Array<{ ref: EvidenceRef; text: string }>
  pages: number
}

/** Drop lines until the render fits `target` pages (or nothing droppable is left). */
export function trimToTarget(
  profile: ResumeProfile,
  recipe: Recipe,
  checklist: readonly ChecklistItem[],
  jd: ParsedJd,
  target: 1 | 2,
): TrimResult {
  const keep = new Set(checklist.flatMap((c) => (c.status !== 'missing' && c.source ? [refKey(c.source)] : [])))
  let current = recipe
  const drops: TrimResult['drops'] = []
  let pages = renderVariant(profile, current).estimatedPages
  for (let step = 0; step < MAX_STEPS && pages > target + PAGE_SLACK; step++) {
    const next = candidates(profile, current, keep, jd)[0]
    if (!next) break
    current = dropRefs(current, [next.ref])
    // A project with no bullet left goes too.
    const empty = current.projects.filter((p) => p.highlights.length === 0).map((p): EvidenceRef => ({ kind: 'project', id: p.id }))
    if (empty.length > 0) current = dropRefs(current, empty)
    drops.push({ ref: next.ref, text: next.text })
    pages = renderVariant(profile, current).estimatedPages
  }
  return { recipe: current, drops, pages }
}
