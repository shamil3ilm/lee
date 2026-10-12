import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '@/lib/db/schema'
import { sources } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { queueFirstPolls } from '@/lib/queue/first-poll'
import { sourceBlocker } from './readiness'
import { loadSourceSetup } from './setup'

/**
 * SERVER-ONLY. Bulk changes on Settings › Sources, always scoped to the
 * caller's own rows: an id that is not theirs (or a watch link, for the
 * polled list) is simply not matched. Each change is one UPDATE.
 */

export interface BulkToggleResult {
  /** Ids asked for (deduped). */
  requested: number
  /** Of those, the user's own polled sources. */
  matched: number
  /** Rows whose state changed. */
  changed: number
  /** Excluded from "Turn on": lee can't poll them for this user (no Gmail, no key …). */
  blocked: number
  /** Sources with a pending poll after this call (one each: polls coalesce). */
  queued: number
  /** Poll jobs inserted by this call. */
  created: number
}

/**
 * `db` is a union of the postgres-js and PGlite drivers, which hides
 * drizzle's `returning(fields)` overload; both implement it the same
 * (as lib/db/queries/discoveries.ts does). Only ids come back.
 */
function writer(): PostgresJsDatabase<typeof schema> {
  return db as unknown as PostgresJsDatabase<typeof schema>
}

interface OwnedSource {
  id: string
  kind: string
  config: unknown
  enabled: boolean
  lastPolledAt: Date | null
}

/** The caller's polled sources among `ids` (watch links are not polled). */
async function ownedPolled(userId: string, ids: readonly string[]): Promise<OwnedSource[]> {
  if (ids.length === 0) return []
  return db
    .select({ id: sources.id, kind: sources.kind, config: sources.config, enabled: sources.enabled, lastPolledAt: sources.lastPolledAt })
    .from(sources)
    .where(and(eq(sources.userId, userId), inArray(sources.id, [...ids]), ne(sources.kind, 'watch')))
}

/** Pollable for this user, with the blocked ones counted. */
async function splitReady(userId: string, rows: readonly OwnedSource[]): Promise<{ ready: OwnedSource[]; blocked: number }> {
  if (rows.length === 0) return { ready: [], blocked: 0 }
  const setup = await loadSourceSetup(userId)
  const ready = rows.filter((r) => sourceBlocker(r.kind, r.config, setup) === null)
  return { ready, blocked: rows.length - ready.length }
}

/**
 * Switch the user's sources on or off in one UPDATE. Turning on skips
 * sources lee can't poll for them (lib/sources/readiness.ts) and queues a
 * first poll for each one switched on — coalesced, stalest first, only a
 * few run right after the response (lib/queue/first-poll.ts).
 */
export async function setSourcesEnabledFor(
  userId: string,
  ids: readonly string[],
  enabled: boolean,
  now: Date = new Date(),
): Promise<BulkToggleResult> {
  const unique = [...new Set(ids)]
  const owned = await ownedPolled(userId, unique)
  const { ready, blocked } = enabled ? await splitReady(userId, owned) : { ready: owned, blocked: 0 }
  const target = ready.filter((r) => r.enabled !== enabled).map((r) => r.id)
  const changed =
    target.length === 0
      ? []
      : await writer()
          .update(sources)
          .set({ enabled })
          .where(and(eq(sources.userId, userId), inArray(sources.id, target), ne(sources.kind, 'watch'), ne(sources.enabled, enabled)))
          .returning({ id: sources.id })
  const changedIds = new Set(changed.map((r) => r.id))
  const polls = enabled
    ? await queueFirstPolls(
        userId,
        ready.filter((r) => changedIds.has(r.id)),
        now,
      )
    : { created: 0, queued: 0, inline: 0 }
  const result: BulkToggleResult = {
    requested: unique.length,
    matched: owned.length,
    changed: changed.length,
    blocked,
    queued: polls.queued,
    created: polls.created,
  }
  // Counts only: never ids, names or URLs.
  logger.info('sources_bulk_toggle', { enabled, ...result, inline: polls.inline })
  return result
}

export interface BulkCheckResult {
  requested: number
  /** The user's own sources that are on and pollable. */
  checked: number
  queued: number
  created: number
}

/** "Check now": queue a poll (coalesced, at most once an hour) for each selected source that is on and pollable. */
export async function checkSourcesNowFor(userId: string, ids: readonly string[], now: Date = new Date()): Promise<BulkCheckResult> {
  const unique = [...new Set(ids)]
  const owned = (await ownedPolled(userId, unique)).filter((r) => r.enabled)
  const { ready } = await splitReady(userId, owned)
  const polls = await queueFirstPolls(userId, ready, now, { manual: true })
  const result = { requested: unique.length, checked: ready.length, queued: polls.queued, created: polls.created }
  logger.info('sources_bulk_check', { ...result, inline: polls.inline })
  return result
}

export interface WatchRemindersResult {
  requested: number
  changed: number
}

/**
 * Watch links (checked by hand): weekly reminders on or off for many at
 * once — `config.watching`, as the per-row toggle stores it
 * (lib/defaults/watch-status.ts). One UPDATE, other config keys kept.
 */
export async function setWatchRemindersFor(userId: string, ids: readonly string[], watching: boolean): Promise<WatchRemindersResult> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return { requested: 0, changed: 0 }
  const rows = await writer()
    .update(sources)
    .set({ config: sql`coalesce(${sources.config}, '{}'::jsonb) || jsonb_build_object('watching', ${watching}::boolean)` })
    .where(and(eq(sources.userId, userId), inArray(sources.id, unique), eq(sources.kind, 'watch')))
    .returning({ id: sources.id })
  const result = { requested: unique.length, changed: rows.length }
  logger.info('sources_bulk_watch', { watching, ...result })
  return result
}
