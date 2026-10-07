import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PgDatabase } from 'drizzle-orm/pg-core'
import { PGlite } from '@electric-sql/pglite'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'
import { lazyObject } from './lazy'
import { acquirePgliteLock } from './pglite-lock'
import { PGLITE_QUERY_DELAY_ENV, parseQueryDelay, withSimulatedLatency } from './pglite-latency'

type DrizzleDb = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>

type DbInstance = {
  db: DrizzleDb
  close: () => Promise<void>
  pglite?: PGlite
}

function isPgliteUrl(url: string): boolean {
  return url.startsWith('pglite:')
}

function makePglite(url: string): DbInstance {
  const path = url.slice('pglite:'.length)
  // 'pglite:' or 'pglite:memory://' -> in-memory (no directory, no lock).
  const inMemory = path === '' || path === 'memory://'
  // One process per data directory (./pglite-lock.ts): a second process on
  // the same files aborts or, worse, runs crash recovery under the first.
  const release = inMemory ? () => {} : acquirePgliteLock(path)
  if (!inMemory) process.once('exit', release)
  const client = inMemory ? new PGlite() : new PGlite(path)
  // Local perf testing only (see ./pglite-latency.ts); a no-op when unset.
  const delayMs = parseQueryDelay(process.env[PGLITE_QUERY_DELAY_ENV])
  return {
    db: drizzlePglite(withSimulatedLatency(client, delayMs), { schema }),
    close: async () => {
      try {
        await client.close()
      } finally {
        release()
      }
    },
    pglite: client,
  }
}

function makeDb(): DbInstance {
  const url = env.DATABASE_URL
  if (isPgliteUrl(url)) return makePglite(url)
  // Serverless tuning: close a connection idle for 20s so a frozen/recycled
  // function instance doesn't hold a Neon slot, and fail a connect attempt
  // after 10s instead of hanging on postgres-js's 30s default.
  // `prepare` stays on (default): Neon's PgBouncer supports protocol-level
  // prepared statements.
  // Not using @vercel/functions attachDatabasePool: it only hooks pools that
  // emit pool events (pg/mysql/mongo/ioredis `.on(...)`); postgres-js exposes
  // no event emitter, so it would be a no-op for this client.
  const client = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10 })
  return {
    db: drizzlePg(client, { schema }),
    close: async () => {
      await client.end()
    },
  }
}

/**
 * The instance is created on first use, not when this module loads.
 * `next dev` forks a short-lived static-paths worker process for every
 * dynamic route it serves, and that worker evaluates the page's module graph
 * (this file included) without ever querying. Opening PGlite at import time
 * made each of those workers start a second Postgres on the e2e data
 * directory ("RuntimeError: Aborted()" in the dev-server log). One instance
 * per process, shared across Turbopack's module copies via globalThis.
 */
const globalForDb = globalThis as unknown as { __employInstance?: DbInstance }
let local: DbInstance | undefined

function instance(): DbInstance {
  const existing = local ?? globalForDb.__employInstance
  if (existing) return (local = existing)
  const created = makeDb()
  local = created
  if (process.env.NODE_ENV !== 'production') globalForDb.__employInstance = created
  return created
}

/** Drizzle client. Lazy: opens the database on the first query. */
export const db: DrizzleDb = lazyObject<DrizzleDb>(PgDatabase.prototype, () => instance().db)
export const isPglite = isPgliteUrl(env.DATABASE_URL)

/** The raw PGlite client (opens the database), or undefined on Postgres. */
export function getPgliteClient(): PGlite | undefined {
  return isPglite ? instance().pglite : undefined
}

/** Close the database if it was opened; the next query opens it again. */
export async function closeDb(): Promise<void> {
  const current = local ?? globalForDb.__employInstance
  if (!current) return
  local = undefined
  if (globalForDb.__employInstance === current) globalForDb.__employInstance = undefined
  await current.close()
}

export type Db = typeof db
// Transaction argument type — the value passed into a `db.transaction(async (tx) => ...)` callback.
// Query functions accept `Db | Tx` so they can be composed inside a transaction.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbClient = Db | Tx
