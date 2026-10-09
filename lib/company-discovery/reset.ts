import { sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import * as sourcesQ from '@/lib/db/queries/sources'
import { affected } from '@/lib/db/retention/batch'
import { logger } from '@/lib/logger'
import { copyGrowthToPostings } from './growth/postings'
import { LOCAL_COMPANIES_KIND } from './service'

/**
 * "Reset companies": remove the user's discovered companies so the next
 * search finds them afresh. Owner-scoped, batched and idempotent. Logged
 * with counts only (`companies_reset`).
 *
 * Removed: company discoveries with their growth and signal data, role
 * snapshots and fit, including dismissed ones. Those rows are what keep a
 * company from coming back, so deleting them lets it return.
 *
 * Kept:
 * - by default, companies you watch or saved (the Watching segment);
 * - by default, companies you added yourself (pasted or found by name);
 * - always, rows linked to a speculative application or promoted to your
 *   companies list.
 *
 * Never touched: applications, contacts, jobs, your companies list and the
 * job-board or careers-page sources that "Watch" added (they stay in
 * Settings › Sources).
 *
 * Afterwards the search cursors (park pages, GitHub pages) are reset, so the
 * next run re-reads every list, and growth copied onto job postings is
 * re-synced to the companies that remain.
 */

export interface CompanyResetOptions {
  /** Keep watched and saved companies (default on). */
  keepWatched?: boolean
  /** Also remove companies the user added (paste, search). Default off. */
  includeOwn?: boolean
}

export interface CompanyResetCounts {
  /** Rows the reset would remove. */
  remove: number
  /** Rows kept because they are watched or saved. */
  keptWatched: number
  /** Rows kept because the user added them. */
  keptOwn: number
  /** Rows always kept (speculative application, promoted company). */
  keptLinked: number
}

export interface CompanyResetResult {
  deleted: number
  /** More rows remain (deadline reached): run again, it is idempotent. */
  remaining: boolean
}

export const COMPANY_RESET_BATCH = 500

const OWN_TAGS = sql`array['paste', 'search']::text[]`

const linked = sql`(c.application_id is not null or c.added_company_id is not null)`
const watched = sql`(c.watch is not null or c.status = 'saved')`
const own = sql`(c.source_tags && ${OWN_TAGS})`

function removable(userId: string, o: CompanyResetOptions): SQL {
  return sql`c.user_id = ${userId}::uuid
    and not ${linked}
    ${o.keepWatched === false ? sql`` : sql`and not ${watched}`}
    ${o.includeOwn ? sql`` : sql`and not ${own}`}`
}

function rowsOf(res: unknown): Array<Record<string, unknown>> {
  return ((res as { rows?: Array<Record<string, unknown>> }).rows ?? (res as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>
}

/** What a reset with these options would do (for the dialog). */
export async function previewCompanyReset(userId: string, o: CompanyResetOptions = {}, client: DbClient = db): Promise<CompanyResetCounts> {
  const res = await client.execute(sql`
    select
      count(*) filter (where ${removable(userId, o)})::int as remove,
      count(*) filter (where not ${linked} and ${o.keepWatched === false ? sql`false` : watched})::int as kept_watched,
      count(*) filter (where not ${linked} and not ${o.keepWatched === false ? sql`false` : watched} and ${o.includeOwn ? sql`false` : own})::int as kept_own,
      count(*) filter (where ${linked})::int as kept_linked
    from company_discoveries c
    where c.user_id = ${userId}::uuid
  `)
  const r = rowsOf(res)[0] ?? {}
  return { remove: Number(r.remove ?? 0), keptWatched: Number(r.kept_watched ?? 0), keptOwn: Number(r.kept_own ?? 0), keptLinked: Number(r.kept_linked ?? 0) }
}

async function deleteBatch(userId: string, o: CompanyResetOptions, client: DbClient): Promise<number> {
  const ids = rowsOf(await client.execute(sql`select c.id from company_discoveries c where ${removable(userId, o)} limit ${COMPANY_RESET_BATCH}`))
  if (ids.length === 0) return 0
  const list = sql.join(ids.map((r) => sql`${String(r.id)}::uuid`), sql`, `)
  const res = await client.execute(sql`delete from company_discoveries where user_id = ${userId}::uuid and id in (${list})`)
  return affected(res) || ids.length
}

/** Start every list from page one on the next run, and show the search as not yet run. */
async function resetCursors(userId: string): Promise<void> {
  for (const s of await sourcesQ.list(userId)) {
    if (s.kind !== LOCAL_COMPANIES_KIND) continue
    const config = { ...((s.config ?? {}) as Record<string, unknown>) }
    delete config.cursors
    await sourcesQ.update(userId, s.id, { config, lastPolledAt: null })
  }
}

export async function resetCompanies(
  userId: string,
  o: CompanyResetOptions = {},
  run: { deadline?: number; client?: DbClient; now?: Date } = {},
): Promise<CompanyResetResult> {
  const client = run.client ?? db
  const deadline = run.deadline ?? Number.POSITIVE_INFINITY
  let deleted = 0
  let remaining = false
  for (;;) {
    if (Date.now() >= deadline) {
      remaining = true
      break
    }
    const n = await deleteBatch(userId, o, client)
    deleted += n
    if (n < COMPANY_RESET_BATCH) break
  }
  if (!remaining) {
    await resetCursors(userId)
    await copyGrowthToPostings(userId, run.now ?? new Date())
  }
  logger.info('companies_reset', {
    userId,
    deleted,
    remaining,
    keepWatched: o.keepWatched !== false,
    includeOwn: Boolean(o.includeOwn),
  })
  return { deleted, remaining }
}
