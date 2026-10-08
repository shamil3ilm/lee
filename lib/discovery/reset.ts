import { sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import * as profileQ from '@/lib/db/queries/profile'
import { affected } from '@/lib/db/retention/batch'
import { tombstoneDismissedDiscoveries } from '@/lib/db/retention/discoveries'
import { logger } from '@/lib/logger'

/**
 * "Reset discoveries": remove the user's job discoveries so sources can fill
 * the inbox afresh. Owner-scoped, batched, idempotent, logged with counts
 * only (`discoveries_reset`).
 *
 * Removed: new, filtered and (by default) dismissed postings; shortlisted
 * ones only when asked. NEVER removed: saved postings, anything linked to an
 * application (saved_application_id), anything being prepared (a shortlist
 * entry in state "preparing").
 *
 * Dismissed rows are what block re-import (their source id is the dedupe
 * key). With `allowReimport` (default) they are deleted so postings can come
 * back; without it they are kept, slimmed to tombstones.
 *
 * Related rows: Scam Shield assessments of removed rows are deleted (no FK),
 * shortlist entries go by cascade, Match Scores live on the rows. "Not for
 * me" feedback and learned titles are kept unless `resetLearned`.
 */

export interface ResetOptions {
  /** Only these sources; empty or absent = all sources. */
  sourceIds?: readonly string[]
  /** Also remove shortlisted postings the user has not acted on. */
  includeShortlisted?: boolean
  /** Delete dismissed tombstones so postings can be re-imported (default on). */
  allowReimport?: boolean
  /** Also forget learned titles and "Not for me" feedback. */
  resetLearned?: boolean
}

export interface ResetResult {
  deleted: number
  tombstoned: number
  /** More rows remain (deadline reached): run again, it is idempotent. */
  remaining: boolean
}

export const RESET_BATCH = 500

function where(userId: string, opts: ResetOptions): SQL {
  const statuses = [
    'new',
    'filtered',
    ...(opts.includeShortlisted ? ['shortlisted'] : []),
    ...(opts.allowReimport === false ? [] : ['dismissed']),
  ]
  const sources = opts.sourceIds && opts.sourceIds.length > 0 ? opts.sourceIds : null
  return sql`d.user_id = ${userId}::uuid
    and d.status in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})
    and d.saved_application_id is null
    ${sources ? sql`and d.source_id in (${sql.join(sources.map((s) => sql`${s}::uuid`), sql`, `)})` : sql``}
    and not exists (
      select 1 from shortlist_entries s where s.discovery_id = d.id and s.state = 'preparing'
    )`
}

async function deleteBatch(userId: string, opts: ResetOptions, client: DbClient): Promise<number> {
  const ids = (await client.execute(sql`select d.id from discoveries d where ${where(userId, opts)} limit ${RESET_BATCH}`)) as unknown
  const rows = ((ids as { rows?: Array<{ id: string }> }).rows ?? (ids as Array<{ id: string }>)) as Array<{ id: string }>
  if (rows.length === 0) return 0
  const list = sql.join(rows.map((r) => sql`${r.id}::uuid`), sql`, `)
  await client.execute(sql`
    delete from job_risk_assessments
    where user_id = ${userId}::uuid and target_type = 'discovery' and target_id in (${list})
  `)
  const res = await client.execute(sql`delete from discoveries where user_id = ${userId}::uuid and id in (${list})`)
  return affected(res) || rows.length
}

export async function resetDiscoveries(
  userId: string,
  opts: ResetOptions = {},
  run: { deadline?: number; client?: DbClient } = {},
): Promise<ResetResult> {
  const client = run.client ?? db
  const deadline = run.deadline ?? Number.POSITIVE_INFINITY
  let deleted = 0
  let remaining = false
  for (;;) {
    if (Date.now() >= deadline) {
      remaining = true
      break
    }
    const n = await deleteBatch(userId, opts, client)
    deleted += n
    if (n < RESET_BATCH) break
  }
  // Without re-import, dismissed rows stay as slim tombstones.
  const tombstoned =
    opts.allowReimport === false && !remaining
      ? await tombstoneDismissedDiscoveries(new Date(), { userId, days: 0, client, deadline })
      : 0
  if (opts.resetLearned && !remaining) {
    await profileQ.upsert(userId, { learnedTitles: {} })
    await client.execute(sql`delete from discovery_feedback where user_id = ${userId}::uuid`)
  }
  logger.info('discoveries_reset', {
    userId,
    deleted,
    tombstoned,
    remaining,
    sources: opts.sourceIds?.length ?? 0,
    includeShortlisted: Boolean(opts.includeShortlisted),
    allowReimport: opts.allowReimport !== false,
    resetLearned: Boolean(opts.resetLearned),
  })
  return { deleted, tombstoned, remaining }
}
