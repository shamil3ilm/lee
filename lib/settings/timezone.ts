import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userProfile } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { isValidTimeZone } from '@/lib/ui/date'
import { DEFAULT_TIMEZONE } from '@/lib/ui/timezone'

/**
 * The user's IANA timezone (Settings › Profile), memoized per request. Every
 * rendered time goes through it, so "2:30 PM" means 2:30 PM where the user
 * is, not on the server (UTC). Falls back to DEFAULT_TIMEZONE when there is
 * no profile yet, the stored zone is invalid, or the lookup fails.
 */
export const getUserTimeZone = cache(async (userId: string): Promise<string> => {
  try {
    const [row] = await db
      .select({ timezone: userProfile.timezone })
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1)
    return isValidTimeZone(row?.timezone) ? row.timezone : DEFAULT_TIMEZONE
  } catch (err) {
    logger.warn('user_timezone_lookup_failed', { err: err instanceof Error ? err.message : String(err) })
    return DEFAULT_TIMEZONE
  }
})
