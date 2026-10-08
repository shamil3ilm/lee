import { z } from 'zod'
import * as itemsQ from '@/lib/db/queries/radarItems'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { logger } from '@/lib/logger'
import { RadarError } from './errors'
import { cleanTerm, compileTerms, matchTerms } from './match'

export { RadarError } from './errors'

/**
 * The watchlist: the user adds, edits, mutes and removes terms. Every
 * change re-matches the user's stored items (a few thousand at most, kept
 * small by retention) so highlights, counts and digests follow at once.
 */

export const MAX_TERMS = 50
export const MAX_ALIASES = 8

const phrase = z
  .string()
  .transform((s) => cleanTerm(s))
  .refine((s) => s.length >= 2 && s.length <= 80, 'Use 2 to 80 characters.')

export const termInputSchema = z.object({
  term: phrase,
  aliases: z
    .array(z.string())
    .default([])
    .transform((list) => [...new Set(list.map(cleanTerm).filter((a) => a.length >= 2 && a.length <= 80))]),
  kind: z.enum(['term', 'entity']).default('term'),
})

export type TermInput = z.input<typeof termInputSchema>

function parse(input: unknown): z.infer<typeof termInputSchema> {
  const r = termInputSchema.safeParse(input)
  if (!r.success) throw new RadarError(r.error.issues[0]?.message ?? 'Check the term.')
  if (r.data.aliases.length > MAX_ALIASES) throw new RadarError(`At most ${MAX_ALIASES} aliases.`)
  const aliases = r.data.aliases.filter((a) => a.toLowerCase() !== r.data.term.toLowerCase())
  return { ...r.data, aliases }
}

/** Recompute item and entry matches for the user's current terms. Returns items changed. */
export async function rematchUser(userId: string): Promise<number> {
  const compiled = compileTerms(await termsQ.list(userId))
  let changed = 0
  for (const item of await itemsQ.itemsForMatching(userId)) {
    const next = matchTerms([item.title, item.excerpt], compiled)
    if (next.join() === [...item.matchedTerms].join()) continue
    await itemsQ.setItemTerms(userId, item.id, next)
    changed += 1
  }
  if (changed > 0) await itemsQ.refreshEntryTerms(userId)
  return changed
}

export async function addTerm(userId: string, input: unknown): Promise<termsQ.RadarTermRow> {
  const w = parse(input)
  const existing = await termsQ.list(userId)
  if (existing.length >= MAX_TERMS) throw new RadarError(`You can watch up to ${MAX_TERMS} terms.`, 'limit')
  if (await termsQ.exists(userId, w.term, null)) throw new RadarError('You already watch that term.', 'duplicate')
  const row = await termsQ.insert(userId, w)
  if (!row) throw new RadarError('You already watch that term.', 'duplicate')
  const matched = await rematchUser(userId)
  logger.info('radar_watch_changed', { action: 'added', terms: existing.length + 1, matched })
  return row
}

export async function editTerm(userId: string, id: string, input: unknown): Promise<termsQ.RadarTermRow> {
  const w = parse(input)
  if (await termsQ.exists(userId, w.term, id)) throw new RadarError('You already watch that term.', 'duplicate')
  const row = await termsQ.update(userId, id, w)
  if (!row) throw new RadarError('That term is gone.', 'not_found')
  await rematchUser(userId)
  logger.info('radar_watch_changed', { action: 'edited' })
  return row
}

export async function setTermMuted(userId: string, id: string, muted: boolean): Promise<void> {
  const row = await termsQ.update(userId, id, { muted })
  if (!row) throw new RadarError('That term is gone.', 'not_found')
  await rematchUser(userId)
  logger.info('radar_watch_changed', { action: muted ? 'muted' : 'unmuted' })
}

export async function removeTerm(userId: string, id: string): Promise<void> {
  if (!(await termsQ.remove(userId, id))) throw new RadarError('That term is gone.', 'not_found')
  await rematchUser(userId)
  logger.info('radar_watch_changed', { action: 'removed' })
}
