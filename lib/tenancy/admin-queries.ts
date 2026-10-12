import { desc } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

/**
 * SERVER-ONLY. Owner admin views (spec §7.5): account metadata only, never
 * another user's applications, documents, discoveries, keys or logs.
 */

export interface MemberView {
  id: string
  email: string
  name: string | null
  status: string
  createdAt: Date
  lastSeenAt: Date | null
}

/** Every account, newest first: email, name, status, joined, last seen. */
export async function listMembers(client: DbClient = db): Promise<MemberView[]> {
  return client
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(500)
}
