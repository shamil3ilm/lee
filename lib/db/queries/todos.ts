import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { todos } from '@/lib/db/schema'

export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert

export type TodoStatus = 'open' | 'done' | 'archived'
export const TODO_STATUSES: readonly TodoStatus[] = ['open', 'done', 'archived']

export function isTodoStatus(v: string): v is TodoStatus {
  return (TODO_STATUSES as readonly string[]).includes(v)
}

export interface ListTodosOpts {
  status?: TodoStatus
  applicationId?: string
  // Filter to todos due within the given number of hours from `now` (also
  // includes overdue open todos).
  dueWithin?: { hours: number; now?: Date }
  tag?: string
  // Default ordering: overdue first, then by due date ascending (nulls last),
  // then by priority descending, then by created_at asc.
  sort?: 'due' | 'priority' | 'created'
}

/**
 * Insert a new todo. `userId` is stamped from the session, never from the
 * caller-provided payload.
 */
export async function create(
  userId: string,
  data: Omit<NewTodo, 'userId' | 'id' | 'createdAt' | 'updatedAt' | 'completedAt'> & {
    completedAt?: Date | null
  },
  client: DbClient = db,
): Promise<Todo> {
  const [row] = await client
    .insert(todos)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert todo')
  return row
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Todo | null> {
  const [row] = await client
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.id, id)))
    .limit(1)
  return row ?? null
}

/**
 * Filtered listing. All filters are AND-combined. `dueWithin` is inclusive
 * of overdue todos so a "next 24h" query still surfaces the ones that fell
 * behind. Default sort orders overdue → due-soon → no-due-date so the UI
 * naturally groups them.
 */
export async function list(
  userId: string,
  opts: ListTodosOpts = {},
  client: DbClient = db,
): Promise<Todo[]> {
  const filters = [eq(todos.userId, userId)]
  if (opts.status) filters.push(eq(todos.status, opts.status))
  if (opts.applicationId) filters.push(eq(todos.applicationId, opts.applicationId))
  if (opts.dueWithin) {
    const now = opts.dueWithin.now ?? new Date()
    const upper = new Date(now.getTime() + opts.dueWithin.hours * 60 * 60 * 1000)
    filters.push(lte(todos.dueAt, upper))
  }
  if (opts.tag) {
    // Postgres `text[]` — @> check for a single element via array literal.
    filters.push(sql`${todos.tags} @> ARRAY[${opts.tag}]::text[]`)
  }

  const rows = await client
    .select()
    .from(todos)
    .where(and(...filters))

  const sortMode = opts.sort ?? 'due'
  const now = Date.now()
  const sorted = [...rows].sort((a, b) => {
    if (sortMode === 'priority') {
      if (b.priority !== a.priority) return b.priority - a.priority
    }
    if (sortMode === 'created') {
      return a.createdAt.getTime() - b.createdAt.getTime()
    }
    // 'due' sort: overdue first, then due-soon ascending, nulls last.
    const aDue = a.dueAt?.getTime() ?? null
    const bDue = b.dueAt?.getTime() ?? null
    const aOverdue = aDue !== null && aDue < now
    const bOverdue = bDue !== null && bDue < now
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    if (aDue === null && bDue === null) {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.createdAt.getTime() - b.createdAt.getTime()
    }
    if (aDue === null) return 1
    if (bDue === null) return -1
    if (aDue !== bDue) return aDue - bDue
    if (b.priority !== a.priority) return b.priority - a.priority
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  return sorted
}

/** Update mutable fields. Returns the row after update, or null when missing. */
export async function update(
  userId: string,
  id: string,
  patch: Partial<
    Omit<NewTodo, 'id' | 'userId' | 'createdAt'>
  >,
  client: DbClient = db,
): Promise<Todo | null> {
  const [row] = await client
    .update(todos)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(todos.userId, userId), eq(todos.id, id)))
    .returning()
  return row ?? null
}

/** Mark a todo done — sets status + completedAt in one round-trip. */
export async function markDone(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Todo | null> {
  const [row] = await client
    .update(todos)
    .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(todos.userId, userId), eq(todos.id, id)))
    .returning()
  return row ?? null
}

/**
 * Flip status open ↔ done. If currently 'archived' returns row unchanged.
 * When flipping to 'done' also stamps `completedAt`; flipping to 'open'
 * clears it so re-completing later regenerates the timestamp.
 */
export async function toggleStatus(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Todo | null> {
  const existing = await getById(userId, id, client)
  if (!existing) return null
  if (existing.status === 'archived') return existing
  const nextStatus: TodoStatus = existing.status === 'done' ? 'open' : 'done'
  const [row] = await client
    .update(todos)
    .set({
      status: nextStatus,
      completedAt: nextStatus === 'done' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(todos.userId, userId), eq(todos.id, id)))
    .returning()
  return row ?? null
}

export async function remove(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<void> {
  await client.delete(todos).where(and(eq(todos.userId, userId), eq(todos.id, id)))
}

/**
 * Return open todos due today or overdue, ordered by priority desc + due asc.
 * Used by the dashboard "Today's todos" row and by the digest.
 */
export async function listDueByEnd(
  userId: string,
  end: Date,
  limit = 20,
  client: DbClient = db,
): Promise<Todo[]> {
  const rows = await client
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.status, 'open'),
        lte(todos.dueAt, end),
      ),
    )
    .orderBy(desc(todos.priority), asc(todos.dueAt))
    .limit(limit)
  return rows
}

/**
 * Return open todos with `dueAt` in [start, end]. Used by the notification
 * scheduler to fire browser notifications for todos crossing their due time.
 */
export async function listDueBetween(
  userId: string,
  start: Date,
  end: Date,
  client: DbClient = db,
): Promise<Todo[]> {
  const rows = await client
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.status, 'open'),
        gte(todos.dueAt, start),
        lte(todos.dueAt, end),
      ),
    )
    .orderBy(asc(todos.dueAt))
  return rows
}

// Sentinel export so consumers can quickly build "no-due" filters without
// re-importing drizzle helpers.
export const _internal = { isNull }
