import * as sourcesQ from '@/lib/db/queries/sources'
import type { Source } from '@/lib/db/queries/sources'
import { LINKEDIN_POST_KIND, LINKEDIN_POST_SOURCE_NAME } from './types'

/**
 * SERVER-ONLY. The user's one `linkedin_post` source. Pasted and captured
 * posts land in it even while it is off (it is created switched off);
 * Settings › LinkedIn › Hiring posts switches it on to read the
 * notification emails in Gmail on every discovery run.
 */
export async function findLinkedInPostSource(userId: string): Promise<Source | null> {
  return (await sourcesQ.list(userId)).find((s) => s.kind === LINKEDIN_POST_KIND) ?? null
}

export async function ensureLinkedInPostSource(userId: string, opts: { enable?: boolean } = {}): Promise<Source> {
  const existing = await findLinkedInPostSource(userId)
  if (existing) {
    if (opts.enable !== undefined && existing.enabled !== opts.enable) {
      const updated = await sourcesQ.update(userId, existing.id, { enabled: opts.enable })
      return updated ?? existing
    }
    return existing
  }
  return sourcesQ.create(userId, { name: LINKEDIN_POST_SOURCE_NAME, kind: LINKEDIN_POST_KIND, config: {}, enabled: opts.enable ?? false })
}
