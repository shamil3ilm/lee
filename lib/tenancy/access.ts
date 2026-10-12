import { eq, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { ACCESS_CACHE_MS } from './limits'

/**
 * SERVER-ONLY. Whether a signed-in session may still act: the user row
 * exists, is active, and the session's version matches (suspend / revoke
 * bump it). Read on every DB-backed `auth()` (lib/auth/config.ts session
 * callback), cached per process for ACCESS_CACHE_MS so a page's several
 * auth() calls cost one primary-key read.
 */

export interface UserAccess {
  status: string
  sessionVersion: number
}

const cache = new Map<string, { at: number; access: UserAccess | null }>()

export function clearAccessCache(userId?: string): void {
  if (userId) cache.delete(userId)
  else cache.clear()
}

export async function loadUserAccess(userId: string, client: DbClient = db, now: number = Date.now()): Promise<UserAccess | null> {
  const hit = cache.get(userId)
  if (hit && now - hit.at < ACCESS_CACHE_MS) return hit.access
  const [row] = await client
    .select({ status: users.status, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const access = row ?? null
  cache.set(userId, { at: now, access })
  return access
}

/** Pure: does a token carrying `tokenVersion` still match this access row? */
export function isAccessValid(access: UserAccess | null, tokenVersion: unknown): boolean {
  if (!access || access.status !== 'active') return false
  // Tokens minted before session versions existed carry none: they match 0.
  const v = typeof tokenVersion === 'number' ? tokenVersion : 0
  return v === access.sessionVersion
}

export async function isSessionActive(userId: string, tokenVersion: unknown, client: DbClient = db): Promise<boolean> {
  return isAccessValid(await loadUserAccess(userId, client), tokenVersion)
}

/** Suspend or reactivate; both bump the session version so live sessions end. */
export async function setUserStatus(userId: string, status: 'active' | 'suspended', client: DbClient = db): Promise<boolean> {
  const rows = await client
    .update(users)
    .set({ status, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning()
  clearAccessCache(userId)
  return rows.length > 0
}
