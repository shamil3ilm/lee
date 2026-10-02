import * as profileQ from '@/lib/db/queries/profile'
import type { SharedLink } from '@/lib/ai/prompts/shared-links'
import { readProfileLinks } from './links'

const ID = /^[a-z0-9-]{1,40}$/

/** Validated `linkIds` from a request body (anything else → []). */
export function parseLinkIds(body: unknown): string[] {
  const ids = (body as { linkIds?: unknown } | null)?.linkIds
  if (!Array.isArray(ids)) return []
  return ids.filter((v): v is string => typeof v === 'string' && ID.test(v)).slice(0, 12)
}

/** The user's stored links with these ids, for a draft prompt. */
export async function resolveSharedLinks(userId: string, ids: readonly string[]): Promise<SharedLink[]> {
  if (ids.length === 0) return []
  const links = readProfileLinks((await profileQ.get(userId))?.links)
  return links.filter((l) => ids.includes(l.id)).map((l) => ({ label: l.label, url: l.url }))
}
