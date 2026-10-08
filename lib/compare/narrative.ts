import { z } from 'zod'
import type { CompareNarrativeFact, CompareNarrativeInput, CompareNarrativeResult } from '@/lib/ai/prompts/compare-narrative'
import { AISkippedError } from '@/lib/ai/signal'
import type { AIProvider } from '@/lib/ai/types'
import * as cmpQ from '@/lib/db/queries/jobComparison'
import { logger } from '@/lib/logger'
import { plural } from '@/lib/ui/labels'
import type { Comparison } from './compare'
import { compareOne } from './service'
import { CompareError } from './settings'
import { CRITERIA, CRITERION_LABELS } from './types'

/**
 * Optional AI narrative over a comparison. On demand, signal-gated (a
 * current job and enough known facts), citing only the facts lee computed.
 * Claims without a valid citation, or with a figure no cited fact contains,
 * are dropped. Nothing is saved until the user confirms. The current salary
 * itself is never sent to the model, only the estimated difference.
 */

export const MIN_FACTS = 3
export const MAX_SAVED_NARRATIVES = 50

const claimSchema = z.object({
  text: z.string().trim().min(1).max(300),
  cites: z.array(z.string().min(1).max(40)).min(1).max(6),
})
export const narrativeDraftSchema = z.object({
  summary: z.array(claimSchema).max(6),
  questions: z.array(claimSchema).max(8),
})
export type NarrativeDraft = z.infer<typeof narrativeDraftSchema>
export type SavedNarrative = NarrativeDraft & { confirmedAt: string }

/** Facts the model may cite (job side only), and the unknowns to ask about. */
export function narrativeInput(c: Comparison): CompareNarrativeInput {
  const facts: CompareNarrativeFact[] = []
  for (const k of CRITERIA) {
    for (const e of c.job.criteria[k].evidence) {
      if (e.confidence === 'unknown') continue
      const est = e.confidence === 'estimated' ? ' (estimate)' : ''
      facts.push({ id: e.id, text: `${CRITERION_LABELS[k]}: ${e.shared ?? e.text}${est}` })
    }
  }
  c.redFlags.forEach((f, i) =>
    facts.push({ id: `flag:${i + 1}`, text: `${f.confirmed ? 'Confirmed red flag' : 'Unconfirmed news'}: ${f.text}` }),
  )
  if (c.reviews.average !== null) {
    facts.push({ id: 'reviews', text: `Your recorded review ratings average ${c.reviews.average}/5 (${c.reviews.ratings.length} sites)` })
  }
  const unknowns = c.questions.map((q) => ({ id: q.id, text: q.text }))
  return { jobTitle: c.title, companyName: c.companyName, facts, unknowns }
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g
const plain = (s: string): string => s.replace(/,/g, '')

/** True when every figure in `text` is one of the figures in the cited facts (exact match). */
export function figuresGrounded(text: string, cited: readonly string[]): boolean {
  const known = new Set(cited.flatMap((c) => [...c.matchAll(NUMBER_RE)].map((m) => plain(m[0]))))
  return [...text.matchAll(NUMBER_RE)].every((m) => known.has(plain(m[0])))
}

function keep(claims: CompareNarrativeResult['summary'], known: ReadonlyMap<string, string>, max: number) {
  return claims
    .map((c) => ({ text: c.text.trim().slice(0, 300), cites: [...new Set(c.cites.filter((id) => known.has(id)))].slice(0, 6) }))
    .filter((c) => c.text.length > 0 && c.cites.length > 0)
    .filter((c) => figuresGrounded(c.text, c.cites.map((id) => known.get(id) ?? '')))
    .slice(0, max)
}

export function sanitizeNarrative(raw: CompareNarrativeResult, input: CompareNarrativeInput): NarrativeDraft {
  const known = new Map([...input.facts, ...input.unknowns].map((f) => [f.id, f.text] as const))
  return { summary: keep(raw.summary, known, 5), questions: keep(raw.questions, known, 6) }
}

export function checkNarrativeSignal(input: CompareNarrativeInput, hasCurrent: boolean): void {
  if (!hasCurrent) {
    throw new AISkippedError('compare_no_current_job', 'Add your current job first.', 'Settings › Current job.')
  }
  if (input.facts.length < MIN_FACTS) {
    throw new AISkippedError(
      'compare_thin',
      `Only ${plural(input.facts.length, 'known fact')} about this job — too few to write about.`,
      'Add the posting text, record a review rating or refresh the company first.',
    )
  }
}

export async function draftNarrative(userId: string, key: string, ai: AIProvider, now: Date = new Date()): Promise<NarrativeDraft> {
  const { settings, comparison } = await compareOne(userId, key, now)
  if (!comparison) throw new CompareError('That job was not found.')
  const input = narrativeInput(comparison)
  checkNarrativeSignal(input, settings.current !== null)
  const raw = await ai.narrateComparison(input, { userId, kind: 'job_comparison_narrative' })
  return sanitizeNarrative(raw, input)
}

function readSaved(value: unknown): Record<string, SavedNarrative> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<string, SavedNarrative> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = narrativeDraftSchema.extend({ confirmedAt: z.string() }).safeParse(v)
    if (p.success) out[k] = p.data
  }
  return out
}

export function savedNarrative(narratives: unknown, key: string): SavedNarrative | null {
  return readSaved(narratives)[key] ?? null
}

/** Save the user's edited narrative; every claim must still cite a current fact. */
export async function confirmNarrative(userId: string, key: string, draft: unknown, now: Date = new Date()): Promise<SavedNarrative> {
  const parsed = narrativeDraftSchema.safeParse(draft)
  if (!parsed.success) throw new CompareError('Every sentence needs at least one source.')
  const { settings, comparison } = await compareOne(userId, key, now)
  if (!comparison) throw new CompareError('That job was not found.')
  const input = narrativeInput(comparison)
  const known = new Map([...input.facts, ...input.unknowns].map((f) => [f.id, f.text] as const))
  const claims = [...parsed.data.summary, ...parsed.data.questions]
  const bad = claims.find((c) => c.cites.some((id) => !known.has(id)))
  if (bad) throw new CompareError(`Every sentence needs a valid source. Check: “${bad.text.slice(0, 60)}”`)
  const ungrounded = claims.find((c) => !figuresGrounded(c.text, c.cites.map((id) => known.get(id) ?? '')))
  if (ungrounded) throw new CompareError(`Use only figures from the cited sources. Check: “${ungrounded.text.slice(0, 60)}”`)
  const saved: SavedNarrative = { ...parsed.data, confirmedAt: now.toISOString() }
  const all = readSaved(settings.narratives)
  const kept = Object.entries({ ...all, [key]: saved })
    .sort((a, b) => b[1].confirmedAt.localeCompare(a[1].confirmedAt))
    .slice(0, MAX_SAVED_NARRATIVES)
  await cmpQ.save(userId, { narratives: Object.fromEntries(kept) })
  logger.info('comparison_narrative_confirmed', { sentences: saved.summary.length })
  return saved
}

export async function clearNarrative(userId: string, key: string): Promise<void> {
  const { narratives } = await cmpQ.get(userId)
  const rest = Object.fromEntries(Object.entries(readSaved(narratives)).filter(([k]) => k !== key))
  await cmpQ.save(userId, { narratives: rest })
}
