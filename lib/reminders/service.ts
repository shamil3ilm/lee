import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications } from '@/lib/db/schema'

/** Applications in these statuses never get reminders. */
const TERMINAL_STATUSES = ['rejected', 'withdrawn'] as const

export interface ReminderSweepResult {
  /** Overdue, non-terminal applications seen. */
  due: number
  /** Reminder activities actually written (0 for apps already reminded today). */
  inserted: number
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function toRows<T>(result: unknown): T[] {
  // postgres-js returns an array, PGlite `{ rows }`.
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/**
 * Cross-user reminder sweep: one `reminder` activity per overdue
 * application per UTC day, in a single statement. Applications that already
 * got a reminder today are skipped, so re-runs (manual triggers, retries,
 * the next day's cron for a still-overdue app) never pile up duplicates.
 */
export async function recordDueReminders(now: Date = new Date()): Promise<ReminderSweepResult> {
  const dayStart = startOfUtcDay(now)
  const terminal = sql.join(
    TERMINAL_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  )
  const result = await db.execute(sql`
    with due as (
      select a.id, a.user_id
      from ${applications} a
      where a.next_action_at is not null
        and a.next_action_at <= ${now.toISOString()}::timestamptz
        and a.status not in (${terminal})
    ),
    ins as (
      insert into ${activities} (user_id, application_id, kind, payload)
      select d.user_id, d.id, 'reminder', '{"reason":"next_action_at reached"}'::jsonb
      from due d
      where not exists (
        select 1 from ${activities} r
        where r.application_id = d.id
          and r.kind = 'reminder'
          and r.created_at >= ${dayStart.toISOString()}::timestamptz
      )
      returning 1
    )
    select (select count(*) from due)::int as due, (select count(*) from ins)::int as inserted
  `)
  const [row] = toRows<{ due: number | string; inserted: number | string }>(result)
  return { due: Number(row?.due ?? 0), inserted: Number(row?.inserted ?? 0) }
}
