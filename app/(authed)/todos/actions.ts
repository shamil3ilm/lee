'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as todosQ from '@/lib/db/queries/todos'
import { TODO_BOARD_STATUSES } from '@/lib/todos/status'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const moveSchema = z.object({
  todoId: z.string().uuid(),
  status: z.enum(TODO_BOARD_STATUSES),
})

/**
 * Todos board drag/move persistence: To do / In progress / Waiting / Done.
 * Archived is not a board column and cannot be set from here. Scoped to
 * the signed-in user; `completedAt` follows the done column.
 */
export async function moveTodo(todoId: string, status: string): Promise<ActionResult> {
  const parsed = moveSchema.safeParse({ todoId, status })
  if (!parsed.success) return { error: 'Invalid move.' }
  try {
    const userId = await requireUserId()
    const row = await todosQ.setBoardStatus(userId, parsed.data.todoId, parsed.data.status)
    if (!row) return { error: 'Todo not found.' }
    revalidatePath('/todos')
    revalidatePath('/')
    if (row.applicationId) revalidatePath(`/applications/${row.applicationId}`)
    return { success: true }
  } catch (err) {
    logger.error('moveTodo failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not move the todo.' }
  }
}
