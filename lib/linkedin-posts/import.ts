import { z } from 'zod'
import type { AIProvider } from '@/lib/ai/types'
import * as discQ from '@/lib/db/queries/discoveries'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { ingestItemsForSource } from '@/lib/discovery/service'
import { logger } from '@/lib/logger'
import { MAX_POST_PASTE_CHARS } from './paste'
import { buildHiringPost } from './post'
import { ensureLinkedInPostSource } from './source'
import { canonicalPostUrl, canonicalProfileUrl } from './urls'

/**
 * SERVER-ONLY. A reviewed pasted / captured post → a `linkedin_post`
 * discovery, through the normal pipeline (relevance gate, Scam Shield on the
 * post text, Match Score: title only). Facts are re-read from the text on
 * the server; the user's edits only replace the role, employer and poster
 * name. Links are canonicalised offline and never fetched.
 */

const text = (max: number) => z.string().trim().max(max).default('')

export const postImportSchema = z.object({
  via: z.enum(['paste', 'capture']),
  text: z.string().max(MAX_POST_PASTE_CHARS).default(''),
  postUrl: z.string().trim().max(2_000).nullable().default(null),
  posterName: text(120),
  posterHeadline: text(200),
  posterUrl: z.string().trim().max(500).nullable().default(null),
  role: text(120),
  company: text(120),
})
export type PostImportInput = z.infer<typeof postImportSchema>

export class PostImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PostImportError'
  }
}

export interface PostImportResult {
  discoveryId: string | null
  /** The post was already a discovery. */
  duplicate: boolean
  quarantined: boolean
}

/** Leave room under the action's time limit for the ingest itself. */
const IMPORT_BUDGET_MS = 30_000

export async function importPost(userId: string, input: PostImportInput, ai: AIProvider): Promise<PostImportResult> {
  const link = input.postUrl ? canonicalPostUrl(input.postUrl) : null
  if (input.postUrl && !link) throw new PostImportError('That is not a LinkedIn post link.')
  const built = buildHiringPost({
    via: input.via,
    link,
    posterName: input.posterName || null,
    posterHeadline: input.posterHeadline || null,
    posterUrl: input.posterUrl ? canonicalProfileUrl(input.posterUrl) : null,
    text: input.text,
  })
  if (!built.item) throw new PostImportError('Add the post link (··· › Copy link to post) or paste the post text with its contact.')
  const job = built.item.normalized as NormalizedJob
  const normalized: NormalizedJob = {
    ...job,
    ...(input.role ? { title: input.role } : link && !input.text ? { title: 'LinkedIn post (paste its text)' } : {}),
    ...(input.company ? { companyName: input.company } : {}),
  }
  const item = { ...built.item, normalized }
  const source = await ensureLinkedInPostSource(userId)
  const stats = await ingestItemsForSource({ userId, source, items: [item], ai, deadline: Date.now() + IMPORT_BUDGET_MS })
  const row = (await discQ.seenBySourceJobIds(source.id, [item.sourceItemId])).get(item.sourceItemId)
  logger.info('linkedin_post_imported', { userId, via: input.via, hiring: built.verdict.hiring, new: stats.new, quarantined: stats.quarantined })
  return { discoveryId: row?.id ?? null, duplicate: stats.new === 0, quarantined: stats.quarantined > 0 }
}
