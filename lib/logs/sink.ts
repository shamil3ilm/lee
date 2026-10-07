import { sql } from 'drizzle-orm'
import type { systemEventCounts as SystemEventCountsTable } from '@/lib/db/schema'
import { setLogSink, type LogSink } from '@/lib/logger'
import { runAfterResponse } from '@/lib/server/after-response'
import { categoryFor, messageFor, shouldPersist, stringKeysFor, toEventName } from './catalog'
import { currentLogContext } from './context'
import { isUuid, sanitizeContext } from './redact'
import type { SystemEventRow } from './types'

/**
 * Logger → system_events. `logger.warn` / `logger.error` are always
 * persisted, `logger.info` only for the catalog's run events.
 *
 * - Never blocks: rows are buffered and written after the response
 *   (lib/server/after-response.ts → Next `after()`), batched per flush;
 *   outside a request the flush starts right away (inline, not awaited).
 * - Never throws and never recurses: failures here go to stdout via
 *   `console`, not through the logger.
 * - Budget: at most `dailyCap` rows per UTC day (then only errors, up to
 *   `errorCap`), counted in system_event_counts with one upsert per flush.
 */

export const DAILY_EVENT_CAP = 2_000
export const DAILY_ERROR_CAP = 2_500
/** Rows waiting for a flush; beyond this new events are dropped. */
const MAX_BUFFER = 1_000
const INSERT_CHUNK = 100

export interface SinkOptions {
  now?: () => Date
  dailyCap?: number
  errorCap?: number
}

interface SinkState {
  buffer: SystemEventRow[]
  scheduled: boolean
  inflight: Set<Promise<void>>
  /** UTC day for which the info/warn cap is known to be reached. */
  cappedDay: string | null
  opts: Required<SinkOptions>
}

const g = globalThis as typeof globalThis & { __leeLogSinkState?: SinkState }

/**
 * The database is loaded on the first flush, not when the sink is installed:
 * instrumentation runs in every server process, and only a process that
 * actually handles requests (and already has the DB open) should open it.
 * lib/db/client.ts is lazy too, and refuses a PGlite directory another
 * process holds (lib/db/pglite-lock.ts).
 */
async function loadDb(): Promise<{
  db: (typeof import('@/lib/db/client'))['db']
  systemEvents: (typeof import('@/lib/db/schema'))['systemEvents']
  systemEventCounts: typeof SystemEventCountsTable
}> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/client'), import('@/lib/db/schema')])
  return { db, systemEvents: schema.systemEvents, systemEventCounts: schema.systemEventCounts }
}

function stdout(what: string, err: unknown): void {
  // Deliberately not the logger: the sink must never feed itself.
  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      event: 'system_events_sink_failed',
      what,
      err: err instanceof Error ? err.message : String(err),
    }),
  )
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Build the row to persist, or null when this call is not persisted. */
export function toEventRow(
  level: string,
  rawEvent: string,
  fields: Readonly<Record<string, unknown>> | undefined,
  now: Date,
): SystemEventRow | null {
  const event = toEventName(rawEvent)
  if (!shouldPersist(level, event)) return null
  const ambient = currentLogContext()
  const pick = (key: 'userId' | 'jobId' | 'sourceId'): string | null => {
    const v = fields?.[key] ?? ambient?.[key]
    return isUuid(v) ? v : null
  }
  const rest = { ...fields }
  delete rest.userId
  delete rest.jobId
  delete rest.sourceId
  const context = sanitizeContext(rest, stringKeysFor(event))
  return {
    userId: pick('userId'),
    level,
    category: categoryFor(event),
    event,
    message: messageFor(event, context),
    context,
    jobId: pick('jobId'),
    sourceId: pick('sourceId'),
    createdAt: now,
  }
}

/**
 * Keep what fits today's budget. A soft cap: concurrent flushes on separate
 * instances can each read the same count and overshoot by about one batch,
 * which is fine for a storage budget (it is not a security boundary). Non-error rows fit while fewer than
 * `dailyCap` rows were persisted today; errors while fewer than `errorCap`.
 * One read + one upsert of the day's counter per flush.
 */
async function applyDailyCap(state: SinkState, rows: readonly SystemEventRow[], day: string): Promise<SystemEventRow[]> {
  const { dailyCap, errorCap } = state.opts
  const candidates = state.cappedDay === day ? rows.filter((r) => r.level === 'error') : rows
  if (candidates.length === 0) return []
  const { db, systemEventCounts } = await loadDb()
  const [current] = await db
    .select({ n: systemEventCounts.n })
    .from(systemEventCounts)
    .where(sql`${systemEventCounts.day} = ${day}::date`)
  let count = current?.n ?? 0
  const kept: SystemEventRow[] = []
  for (const row of candidates) {
    const limit = row.level === 'error' ? errorCap : dailyCap
    if (count < limit) {
      kept.push(row)
      count += 1
    }
  }
  if (count >= dailyCap) state.cappedDay = day
  if (kept.length === 0) return []
  await db
    .insert(systemEventCounts)
    .values({ day, n: kept.length })
    .onConflictDoUpdate({ target: systemEventCounts.day, set: { n: sql`${systemEventCounts.n} + ${kept.length}` } })
  return kept
}

async function flush(state: SinkState): Promise<void> {
  const rows = state.buffer
  state.buffer = []
  state.scheduled = false
  if (rows.length === 0) return
  try {
    const kept = await applyDailyCap(state, rows, utcDay(state.opts.now()))
    const { db, systemEvents } = await loadDb()
    for (let i = 0; i < kept.length; i += INSERT_CHUNK) {
      await db.insert(systemEvents).values(kept.slice(i, i + INSERT_CHUNK))
    }
  } catch (err) {
    stdout('flush', err)
  }
}

function schedule(state: SinkState): void {
  const run = async (): Promise<void> => {
    // Let the rest of the current synchronous work log into the same batch.
    await Promise.resolve()
    const p = flush(state)
    state.inflight.add(p)
    try {
      await p
    } finally {
      state.inflight.delete(p)
    }
  }
  // In a request: after the response. Outside one: starts now, not awaited.
  runAfterResponse('system_events_flush', run).catch((err: unknown) => stdout('schedule', err))
}

function makeSink(state: SinkState): LogSink {
  return (level, rawEvent, fields) => {
    try {
      const row = toEventRow(level, rawEvent, fields, state.opts.now())
      if (!row) return
      if (state.buffer.length >= MAX_BUFFER) return
      state.buffer.push(row)
      if (!state.scheduled) {
        state.scheduled = true
        schedule(state)
      }
    } catch (err) {
      stdout('capture', err)
    }
  }
}

/** Start persisting logger events (server start; tests install it explicitly). */
export function installEventSink(opts: SinkOptions = {}): void {
  const state: SinkState = {
    buffer: [],
    scheduled: false,
    inflight: new Set(),
    cappedDay: null,
    opts: {
      now: opts.now ?? (() => new Date()),
      dailyCap: opts.dailyCap ?? DAILY_EVENT_CAP,
      errorCap: opts.errorCap ?? DAILY_ERROR_CAP,
    },
  }
  g.__leeLogSinkState = state
  setLogSink(makeSink(state))
}

export function uninstallEventSink(): void {
  setLogSink(undefined)
  g.__leeLogSinkState = undefined
}

/** Wait until every buffered event has been written. For tests and scripts. */
export async function flushSystemEvents(): Promise<void> {
  const state = g.__leeLogSinkState
  if (!state) return
  for (let i = 0; i < 10; i++) {
    if (state.buffer.length > 0 && !state.scheduled) {
      state.scheduled = true
      schedule(state)
    }
    if (state.inflight.size === 0 && state.buffer.length === 0) {
      // A scheduled flush may not have started yet (microtask); yield once.
      await new Promise((r) => setTimeout(r, 0))
      if (state.inflight.size === 0 && state.buffer.length === 0) return
    }
    await Promise.all([...state.inflight])
  }
}
