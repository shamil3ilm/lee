import * as discoveriesQ from '@/lib/db/queries/discoveries'

/**
 * SERVER-ONLY. How many postings wait in "Needs a look" for a user: New rows
 * the relevance gate flagged `relevance_notes.needsLook`, quarantine
 * excluded. The sidebar badge and the Discovery subtitle show it apart from
 * New (which never includes them).
 */
export async function countNeedsLook(userId: string): Promise<number> {
  return discoveriesQ.countList(userId, { status: 'new', needsLook: 'only', quarantine: 'exclude' })
}
