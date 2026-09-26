import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applications, companies, contacts, interviewStages, todos } from '@/lib/db/schema'
import {
  TODO_ACTIVE_STATUSES,
  type TodoBoardStatus,
  type TodoStatus,
} from '@/lib/todos/status'

export {
  TODO_STATUSES,
  TODO_ACTIVE_STATUSES,
  TODO_BOARD_STATUSES,
  isTodoStatus,
  isActiveTodoStatus,
  type TodoStatus,
} from '@/lib/todos/status'

export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert

/** SQL filter: the todo is active work (open, in progress or waiting). */
export function todoIsActiveSql() {
  return inArray(todos.status, [...TODO_ACTIVE_STATUSES])
}

export interface ListTodosOpts {
  status?: TodoStatus
  /** Any of these statuses (ignored when `status` is set). */
  statuses?: readonly TodoStatus[]
  applicationId?: string
  // Filter to todos due within the given number of hours from `now` (also
  // includes overdue open todos).
  dueWithin?: { hours: number; now?: Date }
  tag?: string
  // Default ordering: overdue first, then by due date ascending (nulls last),
  // then by priority descending, then by created_at asc.
  sort?: 'due' | 'priority' | 'created'
}

export interface TodoLinks {
  applicationId?: string | null
  stageId?: string | null
  contactId?: string | null
  companyId?: string | null
}

/**
 * True when every non-null link id belongs to `userId`. The FKs alone would
 * happily point a todo at another user's application/contact/company.
 */
export async function linksOwnedBy(userId: string, links: TodoLinks): Promise<boolean> {
  const checks: Array<Promise<unknown[]>> = []
  if (links.applicationId) {
    checks.push(
      db.select({ id: applications.id }).from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.id, links.applicationId))).limit(1),
    )
  }
  if (links.stageId) {
    checks.push(
      db.select({ id: interviewStages.id }).from(interviewStages)
        .where(and(eq(interviewStages.userId, userId), eq(interviewStages.id, links.stageId))).limit(1),
    )
  }
  if (links.contactId) {
    checks.push(
      db.select({ id: contacts.id }).from(contacts)
        .where(and(eq(contacts.userId, userId), eq(contacts.id, links.contactId))).limit(1),
    )
  }
  if (links.companyId) {
    checks.push(
      db.select({ id: companies.id }).from(companies)
        .where(and(eq(companies.userId, userId), eq(companies.id, links.companyId))).limit(1),
    )
  }
  const results = await Promise.all(checks)
  return results.every((rows) => rows.length > 0)
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
  else if (opts.statuses && opts.statuses.length > 0) {
    filters.push(inArray(todos.status, [...opts.statuses]))
  }
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
 * Flip status done → open, and any active status (open, in progress,
 * waiting) → done. If currently 'archived' returns row unchanged.
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
        todoIsActiveSql(),
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
        todoIsActiveSql(),
        gte(todos.dueAt, start),
        lte(todos.dueAt, end),
      ),
    )
    .orderBy(asc(todos.dueAt))
  return rows
}

/** Count of open todos whose due date is strictly before `now` — nav badge. */
export async function countOverdue(
  userId: string,
  now: Date,
  client: DbClient = db,
): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(todos)
    .where(and(eq(todos.userId, userId), todoIsActiveSql(), lt(todos.dueAt, now)))
  return Number(row?.c ?? 0)
}

/** Board columns: every active todo plus the most recently finished ones. */
export async function listForBoard(
  userId: string,
  opts: { doneLimit?: number } = {},
  client: DbClient = db,
): Promise<Todo[]> {
  const [active, done] = await Promise.all([
    list(userId, { statuses: TODO_ACTIVE_STATUSES }, client),
    client
      .select()
      .from(todos)
      .where(and(eq(todos.userId, userId), eq(todos.status, 'done')))
      .orderBy(desc(todos.completedAt), desc(todos.updatedAt))
      .limit(opts.doneLimit ?? 30),
  ])
  return [...active, ...done]
}

/** Count of done todos (the board caps its Done column). */
export async function countDone(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.status, 'done')))
  return Number(row?.c ?? 0)
}

/**
 * Move a todo to a board column. Stamps `completedAt` when it becomes done
 * (keeping the original stamp if it already was) and clears it when it
 * leaves done. Scoped by user; returns null when the todo isn't theirs.
 */
export async function setBoardStatus(
  userId: string,
  id: string,
  status: TodoBoardStatus,
  client: DbClient = db,
): Promise<Todo | null> {
  const [row] = await client
    .update(todos)
    .set({
      status,
      completedAt: status === 'done' ? sql`coalesce(${todos.completedAt}, now())` : null,
      updatedAt: new Date(),
    })
    .where(and(eq(todos.userId, userId), eq(todos.id, id)))
    .returning()
  return row ?? null
}

// Sentinel export so consumers can quickly build "no-due" filters without
// re-importing drizzle helpers.
export const _internal = { isNull }
