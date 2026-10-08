import type { BulletRewriteInput, BulletRewriteResult } from '@/lib/ai/types'
import type { SignalResult } from '@/lib/ai/signal'
import type { ParsedJd } from '@/lib/discovery/match/jd'
import { skillLabel } from '@/lib/discovery/match/lexicon'
import { effectiveWording } from '@/lib/resume/wordings'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'
import type { Recipe } from '@/lib/variants/types'
import type { ChecklistItem, Suggestion } from './types'
import { jdTerms, lockWording, termScore } from './wording'

/**
 * The optional AI part of tailoring: NEW wordings of bullets that already
 * back a met requirement, in the JD's terms. Signal-gated (nothing to
 * reword → no call), and every answer is locked in code before it is
 * shown: the number lock against the master highlight, the domain lock for
 * design-only items, and it must actually use more of the JD's terms. An
 * accepted wording joins the master highlight as an approved alternate
 * (source "ai") only when the user saves. Pure.
 */

export const MAX_AI_BULLETS = 8

export interface OfferedBullet {
  highlightId: string
  text: string
  requirementIds: string[]
}

function findHighlight(profile: ResumeProfile, id: string): { h: Highlight; role: string; company: string } | undefined {
  for (const w of profile.work) for (const h of w.highlights) if (h.id === id) return { h, role: w.position, company: w.name }
  for (const p of profile.projects) for (const h of p.highlights) if (h.id === id) return { h, role: 'Project', company: p.name }
  return undefined
}

function currentPick(recipe: Recipe, id: string): string | null | undefined {
  for (const i of [...recipe.work, ...recipe.projects]) {
    const p = i.highlights.find((h) => h.id === id)
    if (p) return p.wordingId
  }
  return undefined
}

/** Bullets worth rewording: the evidence of met requirements that this CV shows. */
export function offeredBullets(profile: ResumeProfile, recipe: Recipe, checklist: readonly ChecklistItem[]): OfferedBullet[] {
  const out = new Map<string, OfferedBullet>()
  for (const c of checklist) {
    if (c.status !== 'met' || c.source?.kind !== 'highlight') continue
    const pick = currentPick(recipe, c.source.id)
    const found = findHighlight(profile, c.source.id)
    if (pick === undefined || !found) continue
    const prev = out.get(c.source.id)
    if (prev) prev.requirementIds.push(c.id)
    else out.set(c.source.id, { highlightId: c.source.id, text: effectiveWording(found.h, pick).text, requirementIds: [c.id] })
  }
  return [...out.values()].slice(0, MAX_AI_BULLETS)
}

export function checkWordingSignal(bullets: readonly OfferedBullet[], jd: ParsedJd): SignalResult {
  if (bullets.length === 0) {
    return { ok: false, code: 'tailor_no_bullets', message: 'No bullet on this CV backs a met requirement yet.', fixHint: 'Accept an "Include" suggestion first.' }
  }
  if (jd.stack.length === 0 && jd.must.length === 0) {
    return { ok: false, code: 'tailor_no_jd', message: 'The job description names no requirements to word towards.', fixHint: 'Paste the full JD on the posting.' }
  }
  return { ok: true }
}

export function wordingRequest(profile: ResumeProfile, bullets: readonly OfferedBullet[], jd: ParsedJd): BulletRewriteInput {
  return {
    bullets: bullets.flatMap((b) => {
      const f = findHighlight(profile, b.highlightId)
      return f ? [{ id: b.highlightId, text: b.text, role: f.role, company: f.company }] : []
    }),
    terms: [...new Set(jd.stack.map(skillLabel))].slice(0, 30),
  }
}

export interface LockedWordings {
  suggestions: Suggestion[]
  rejected: Array<{ text: string; reason: string }>
}

export function lockAiWordings(
  profile: ResumeProfile,
  bullets: readonly OfferedBullet[],
  answer: BulletRewriteResult,
  jd: ParsedJd,
): LockedWordings {
  const terms = jdTerms(jd)
  const offered = new Map(bullets.map((b) => [b.highlightId, b] as const))
  const suggestions: Suggestion[] = []
  const rejected: LockedWordings['rejected'] = []
  for (const r of answer.rewrites) {
    const b = offered.get(r.id)
    const f = findHighlight(profile, r.id)
    const text = r.text.replace(/\s+/g, ' ').trim()
    if (!b || !f || !text) continue
    if (text === b.text || text === f.h.text || f.h.alternates.some((a) => a.text === text)) continue
    const lock = lockWording(f.h, text)
    if (!lock.ok) {
      rejected.push({ text, reason: lock.reason })
      continue
    }
    if (termScore(text, terms) <= termScore(b.text, terms)) {
      rejected.push({ text, reason: 'Uses no more of the JD’s terms than the current wording.' })
      continue
    }
    suggestions.push({
      id: `ai:${r.id}`,
      kind: 'ai_wording',
      requirementIds: b.requirementIds,
      highlightId: r.id,
      from: b.text,
      text: text.slice(0, 2000),
      reason: 'A new wording in the JD’s terms. Saved to your profile as an approved wording only if you accept it.',
    })
  }
  return { suggestions, rejected }
}
