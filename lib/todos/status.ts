import type { Tone } from '@/lib/ui/tones'

/**
 * Todo statuses. Client-safe (no DB imports) so badges, the board and API
 * validation share one list. `todos.status` is plain text, so adding values
 * needs no migration.
 *
 * - open / in_progress / waiting: active work (counts as "open" for overdue,
 *   reminders, digest and the journey).
 * - done: finished (`completedAt` set).
 * - archived: hidden from the board and default lists.
 */
export const TODO_STATUSES = ['open', 'in_progress', 'waiting', 'done', 'archived'] as const
export type TodoStatus = (typeof TODO_STATUSES)[number]

export const TODO_ACTIVE_STATUSES = ['open', 'in_progress', 'waiting'] as const satisfies readonly TodoStatus[]
export type ActiveTodoStatus = (typeof TODO_ACTIVE_STATUSES)[number]

/** Board columns, in order. Archived stays off the board. */
export const TODO_BOARD_STATUSES = ['open', 'in_progress', 'waiting', 'done'] as const satisfies readonly TodoStatus[]
export type TodoBoardStatus = (typeof TODO_BOARD_STATUSES)[number]

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  open: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
  archived: 'Archived',
}

export const TODO_STATUS_TONE: Record<TodoStatus, Tone> = {
  open: 'neutral',
  in_progress: 'info',
  waiting: 'warning',
  done: 'success',
  archived: 'neutral',
}

export function isTodoStatus(v: string): v is TodoStatus {
  return (TODO_STATUSES as readonly string[]).includes(v)
}

export function isActiveTodoStatus(v: string): v is ActiveTodoStatus {
  return (TODO_ACTIVE_STATUSES as readonly string[]).includes(v)
}
