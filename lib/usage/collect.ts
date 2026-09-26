import { sql } from 'drizzle-orm'
import { db, isPglite, type DbClient } from '@/lib/db/client'
import type { MeterReading } from './meters'
import type { NeonUsage } from './neon-api'

/**
 * Our own measurements (no vendor call). Each is one cheap statement:
 * - pg_database_size(current_database())
 *   https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-DBOBJECT
 * - the largest public tables by pg_total_relation_size (table + indexes + TOAST)
 * - queue counts in one pass over queue_jobs (small: done jobs are pruned)
 * - Postgres-held document asset bytes per user (the 150 MB quota)
 */

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/**
 * Exact sizes (pg_database_size / pg_total_relation_size) read the relation
 * files. On Neon that is fast; in PGlite (local dev and tests) it walks an
 * in-memory filesystem that grows over a long test run, taking seconds. So
 * on PGlite we estimate from the catalog (pages × block size), which is
 * instant; production (Neon) always uses the exact functions.
 */
const EXACT_SIZES = !isPglite

export async function databaseSizeBytes(client: DbClient = db, exact = EXACT_SIZES): Promise<number> {
  const rows = toRows<{ size: string | number }>(
    await client.execute(
      exact
        ? sql`select pg_database_size(current_database())::bigint as size`
        : sql`select (coalesce(sum(relpages), 0) * current_setting('block_size')::bigint)::bigint as size from pg_class`,
    ),
  )
  return Number(rows[0]?.size ?? 0)
}

export const LARGEST_TABLES_LIMIT = 8

export async function largestTables(
  client: DbClient = db,
  exact = EXACT_SIZES,
): Promise<{ name: string; bytes: number }[]> {
  const rows = toRows<{ name: string; bytes: string | number }>(
    await client.execute(
      exact
        ? sql`
            select c.relname as name, pg_total_relation_size(c.oid)::bigint as bytes
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and n.nspname = 'public'
            order by pg_total_relation_size(c.oid) desc
            limit ${LARGEST_TABLES_LIMIT}
          `
        : sql`
            select c.relname as name, (c.relpages * current_setting('block_size')::bigint)::bigint as bytes
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and n.nspname = 'public'
            order by c.relpages desc, c.relname
            limit ${LARGEST_TABLES_LIMIT}
          `,
    ),
  )
  return rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) }))
}

export const JOBS_RUN_WINDOW_DAYS = 14

export interface QueueCounts {
  backlog: number
  dead: number
  doneRecent: number
}

export async function queueCounts(now: Date, client: DbClient = db): Promise<QueueCounts> {
  const since = new Date(now.getTime() - JOBS_RUN_WINDOW_DAYS * 86_400_000).toISOString()
  const rows = toRows<{ backlog: string | number; dead: string | number; done_recent: string | number }>(
    await client.execute(sql`
      select
        count(*) filter (where status in ('queued', 'failed'))::int as backlog,
        count(*) filter (where status = 'dead')::int as dead,
        count(*) filter (where status = 'done' and finished_at >= ${since}::timestamptz)::int as done_recent
      from queue_jobs
    `),
  )
  const r = rows[0]
  return { backlog: Number(r?.backlog ?? 0), dead: Number(r?.dead ?? 0), doneRecent: Number(r?.done_recent ?? 0) }
}

/** Postgres-held document asset bytes per user (Drive-held files cost Neon nothing). */
export async function assetBytesByUser(client: DbClient = db): Promise<Map<string, number>> {
  const rows = toRows<{ user_id: string; bytes: string | number }>(
    await client.execute(sql`
      select u.id as user_id, coalesce(sum(a.size_bytes), 0)::bigint as bytes
      from users u
      left join document_assets a on a.user_id = u.id and a.bytes is not null
      group by u.id
    `),
  )
  return new Map(rows.map((r) => [r.user_id, Number(r.bytes)]))
}

export interface Measurements {
  dbSizeBytes: number
  largestTables: { name: string; bytes: number }[]
  queue: QueueCounts
  assetBytes: Map<string, number>
}

export async function collectMeasurements(now: Date, client: DbClient = db): Promise<Measurements> {
  const [dbSizeBytes, tables, queue, assetBytes] = await Promise.all([
    databaseSizeBytes(client),
    largestTables(client),
    queueCounts(now, client),
    assetBytesByUser(client),
  ])
  return { dbSizeBytes, largestTables: tables, queue, assetBytes }
}

const VERCEL_METERS = [
  'vercel_invocations',
  'vercel_active_cpu',
  'vercel_memory',
  'vercel_fast_transfer',
  'vercel_origin_transfer',
] as const

/** Pure: global readings from our measurements plus the optional Neon usage. */
export function buildGlobalReadings(m: Measurements, neon: NeonUsage | null): MeterReading[] {
  const fromNeon = (v: number | null | undefined): Pick<MeterReading, 'used' | 'source'> =>
    neon && v !== null && v !== undefined ? { used: v, source: 'neon_api' } : { used: null, source: 'unavailable' }
  return [
    { id: 'neon_storage', used: m.dbSizeBytes, source: 'measured' },
    { id: 'neon_compute', ...fromNeon(neon?.computeCuHours) },
    { id: 'neon_egress', ...fromNeon(neon?.egressBytes) },
    ...VERCEL_METERS.map((id): MeterReading => ({ id, used: null, source: 'vendor_dashboard' })),
    { id: 'jobs_run', used: m.queue.doneRecent, source: 'measured' },
    { id: 'queue_backlog', used: m.queue.backlog, source: 'measured' },
    { id: 'queue_dead', used: m.queue.dead, source: 'measured' },
    { id: 'playground_assets', used: 0, source: 'placeholder' },
  ]
}

/** Pure: per-user readings (document files against the 150 MB quota). */
export function buildUserReadings(m: Measurements): Record<string, MeterReading[]> {
  return Object.fromEntries(
    [...m.assetBytes].map(([userId, bytes]) => [
      userId,
      [{ id: 'asset_storage', used: bytes, source: 'measured' } satisfies MeterReading],
    ]),
  )
}

const EMPTY_MEASUREMENTS: Measurements = {
  dbSizeBytes: 0,
  largestTables: [],
  queue: { backlog: 0, dead: 0, doneRecent: 0 },
  assetBytes: new Map(),
}

/** Global readings before the first snapshot: measured values unknown. */
export function emptyGlobalReadings(): MeterReading[] {
  return buildGlobalReadings(EMPTY_MEASUREMENTS, null).map((r) => (r.source === 'measured' ? { ...r, used: null } : r))
}
