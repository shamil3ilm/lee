import { and, desc, eq, gte, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { systemEvents } from '@/lib/db/schema'
import { isUuid } from './redact'
import { isEventCategory, isEventLevel, type EventCategory, type EventLevel } from './types'

/**
 * Settings › Logs. Owner-scoped: the user's own events plus global events
 * (user_id null — cron and cross-user runs, which carry no personal data).
 */

export const EVENTS_PAGE_SIZE = 50
export const TIME_RANGES = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '60d': 24 * 60 } as const
export type TimeRange = keyof typeof TIME_RANGES
export type LevelFilter = EventLevel | 'problems'

export interface EventFilters {
  category?: EventCategory
  level?: LevelFilter
  range: TimeRange
  q?: string
  sourceId?: string
  jobId?: string
}

export interface EventView {
  id: string
  level: EventLevel
  category: EventCategory
  event: string
  message: string
  context: Record<string, unknown>
  jobId: string | null
  sourceId: string | null
  global: boolean
  createdAt: Date
}

const MAX_QUERY = 100
const MAX_PAGE = 1_000

/** Parse untrusted search params into filters (unknown values are ignored). */
export function parseEventFilters(sp: Readonly<Record<string, string | undefined>>): EventFilters & { page: number } {
  const range = sp.range && sp.range in TIME_RANGES ? (sp.range as TimeRange) : '7d'
  const level = sp.level === 'problems' || isEventLevel(sp.level) ? (sp.level as LevelFilter) : undefined
  const pageNum = Number.parseInt(sp.page ?? '', 10)
  const q = (sp.q ?? '').trim().slice(0, MAX_QUERY)
  return {
    range,
    level,
    category: isEventCategory(sp.category) ? sp.category : undefined,
    q: q || undefined,
    sourceId: isUuid(sp.source) ? sp.source : undefined,
    jobId: isUuid(sp.job) ? sp.job : undefined,
    page: Number.isFinite(pageNum) && pageNum > 1 ? Math.min(pageNum, MAX_PAGE) : 1,
  }
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function toView(r: typeof systemEvents.$inferSelect): EventView {
  return {
    id: r.id,
    level: isEventLevel(r.level) ? r.level : 'info',
    category: isEventCategory(r.category) ? r.category : 'app',
    event: r.event,
    message: r.message,
    context: r.context ?? {},
    jobId: r.jobId,
    sourceId: r.sourceId,
    global: r.userId === null,
    createdAt: r.createdAt,
  }
}

export async function listEvents(
  userId: string,
  filters: EventFilters,
  page = 1,
  now: Date = new Date(),
): Promise<{ rows: EventView[]; hasNext: boolean }> {
  const since = new Date(now.getTime() - TIME_RANGES[filters.range] * 60 * 60 * 1000)
  const conds: SQL[] = [
    or(eq(systemEvents.userId, userId), isNull(systemEvents.userId)) as SQL,
    gte(systemEvents.createdAt, since),
  ]
  if (filters.category) conds.push(eq(systemEvents.category, filters.category))
  if (filters.level === 'problems') conds.push(inArray(systemEvents.level, ['warn', 'error']))
  else if (filters.level) conds.push(eq(systemEvents.level, filters.level))
  if (filters.sourceId) conds.push(eq(systemEvents.sourceId, filters.sourceId))
  if (filters.jobId) conds.push(eq(systemEvents.jobId, filters.jobId))
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`
    conds.push(or(ilike(systemEvents.message, pattern), ilike(systemEvents.event, pattern)) as SQL)
  }
  const rows = await db
    .select()
    .from(systemEvents)
    .where(and(...conds))
    .orderBy(desc(systemEvents.createdAt), desc(systemEvents.id))
    .limit(EVENTS_PAGE_SIZE + 1)
    .offset((Math.max(1, page) - 1) * EVENTS_PAGE_SIZE)
  return { rows: rows.slice(0, EVENTS_PAGE_SIZE).map(toView), hasNext: rows.length > EVENTS_PAGE_SIZE }
}

/**
 * The user's latest event among `events` in `category` (e.g. the last Gmail
 * sync) — one indexed, LIMIT 1 query.
 */
export async function latestUserEvent(
  userId: string,
  category: EventCategory,
  events: readonly string[],
): Promise<EventView | null> {
  const [row] = await db
    .select()
    .from(systemEvents)
    .where(
      and(eq(systemEvents.userId, userId), eq(systemEvents.category, category), inArray(systemEvents.event, [...events])),
    )
    .orderBy(desc(systemEvents.createdAt))
    .limit(1)
  return row ? toView(row) : null
}
