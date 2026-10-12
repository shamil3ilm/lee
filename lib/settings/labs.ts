import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userProfile } from '@/lib/db/schema'
import { isOwner } from '@/lib/auth/owner'
import { logger } from '@/lib/logger'
import { labsOn } from './labs-rule'

export { labsDefault, labsOn } from './labs-rule'

/**
 * SERVER-ONLY. Settings › Labs: whether the sidebar shows the side projects
 * (Playground, Radar, Models, Decisions, Expenses). Memoized per request;
 * a failed lookup falls back to off, so a job-search user never sees the lab
 * because of an error.
 */
export const labsEnabled = cache(async (userId: string): Promise<boolean> => {
  try {
    const [[row], owner] = await Promise.all([
      db.select({ labs: userProfile.labsEnabled }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1),
      isOwner(userId),
    ])
    return labsOn(row?.labs, owner)
  } catch (err) {
    logger.warn('labs_lookup_failed', { err: err instanceof Error ? err.message : String(err) })
    return false
  }
})
