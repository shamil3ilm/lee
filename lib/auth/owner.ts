import { eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { isAllowedEmail } from './allowed-email'

/**
 * SERVER-ONLY. The deployment owner is the ALLOWED_EMAIL account. Actions
 * that touch rows beyond the caller's own (storage cleanup runs the global
 * steps too) check this in addition to requiring a session.
 */
export async function isOwner(userId: string, client: DbClient = db): Promise<boolean> {
  const [row] = await client.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  return isAllowedEmail(row?.email)
}
