import { eq, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { env } from '@/lib/env'
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

/** The owner's user id (the ALLOWED_EMAIL row), or null before first sign-in. */
export async function ownerUserId(client: DbClient = db): Promise<string | null> {
  const [row] = await client
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${env.ALLOWED_EMAIL.toLowerCase()}`)
    .limit(1)
  return row?.id ?? null
}

/**
 * The server's env keys (GROQ_API_KEY, FIRECRAWL_API_KEY, …) are the
 * OWNER's. Every per-user key resolver falls back to them only through this:
 * the env value for the owner, null for anyone else (invite-beta audit §1.3).
 */
export async function ownerEnvFallback(
  userId: string,
  value: string | null | undefined,
  client: DbClient = db,
): Promise<string | null> {
  if (!value) return null
  return (await isOwner(userId, client)) ? value : null
}
