import { z } from 'zod'
import * as briefsQ from '@/lib/db/queries/radarBriefs'
import * as itemsQ from '@/lib/db/queries/radarItems'
import { logger } from '@/lib/logger'
import { RadarError } from '../errors'
import type { RadarMetrics } from '../types'
import { verifyDraft } from './sign'
import { computeTimeline } from './timeline'
import { BRIEF_SECTIONS, SOURCE_KINDS, type BriefDraft, type BriefSectionId, type BriefSections } from './types'

/**
 * Save a brief the user confirmed. The draft must carry a valid signature
 * (exactly what the citation check passed); the user may only remove
 * sentences. The timeline is recomputed from the items' metadata at save.
 */

const sentence = z.object({ text: z.string().max(400), quote: z.string().max(300), source: z.string().max(8) })
const draftSchema = z.object({
  entryId: z.string().uuid(),
  sections: z.object(Object.fromEntries(BRIEF_SECTIONS.map((s) => [s, z.array(sentence).max(4)])) as Record<BriefSectionId, z.ZodArray<typeof sentence>>),
  sources: z
    .array(z.object({ id: z.string(), kind: z.enum(SOURCE_KINDS), url: z.string().url(), title: z.string().max(300), fetchedAt: z.string() }))
    .max(4),
  timeline: z.array(z.object({ date: z.string(), label: z.string(), url: z.string().nullable() })).max(20),
  promptVersion: z.string(),
  promptHash: z.string(),
  dropped: z.number().int().min(0),
  signature: z.string(),
})

export const removalSchema = z.array(z.object({ section: z.enum(BRIEF_SECTIONS), index: z.number().int().min(0).max(3) })).max(28)

export type Removal = z.infer<typeof removalSchema>

export function applyRemovals(sections: BriefSections, removed: Removal): BriefSections {
  const drop = new Set(removed.map((r) => `${r.section}:${r.index}`))
  return Object.fromEntries(
    BRIEF_SECTIONS.map((id) => [id, sections[id].filter((_, i) => !drop.has(`${id}:${i}`))]),
  ) as unknown as BriefSections
}

export function countSentences(sections: BriefSections): number {
  return BRIEF_SECTIONS.reduce((n, id) => n + sections[id].length, 0)
}

export async function confirmBrief(userId: string, rawDraft: unknown, rawRemoved: unknown = []): Promise<briefsQ.RadarBriefRow> {
  const parsed = draftSchema.safeParse(rawDraft)
  const removed = removalSchema.safeParse(rawRemoved)
  if (!parsed.success || !removed.success) throw new RadarError('The brief is not valid. Generate it again.')
  const draft = parsed.data as BriefDraft
  if (!verifyDraft(draft)) throw new RadarError('The brief changed after it was checked. Generate it again.')
  const entry = await itemsQ.getEntry(userId, draft.entryId)
  if (!entry) throw new RadarError('That entry is gone.', 'not_found')
  const sections = applyRemovals(draft.sections, removed.data)
  if (countSentences(sections) === 0) throw new RadarError('Keep at least one sentence, or discard the draft.')
  const items = await itemsQ.itemsOfEntry(userId, entry.id)
  const timeline = computeTimeline(items.map((i) => ({ ...i, metrics: i.metrics as RadarMetrics })))
  const row = await briefsQ.upsert(userId, entry.id, {
    sections,
    sources: draft.sources,
    timeline,
    promptVersion: draft.promptVersion,
    promptHash: draft.promptHash,
  })
  logger.info('radar_brief_saved', { sentences: countSentences(sections), sources: draft.sources.length })
  return row
}
