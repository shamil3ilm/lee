'use client'
import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Briefcase, Pencil, Trash2 } from 'lucide-react'
import { moveTodo } from '@/app/(authed)/todos/actions'
import { Board, type BoardColumnDef, type BoardQuickAction } from '@/components/board/board'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { groupBy } from '@/lib/board/move'
import {
  TODO_BOARD_STATUSES,
  TODO_STATUS_LABELS,
  TODO_STATUS_TONE,
  type TodoBoardStatus,
} from '@/lib/todos/status'
import { relativeFromNow } from '@/lib/ui/date'
import { cn } from '@/lib/utils'

const TodoEditDialog = dynamic(
  () => import('@/components/todo-edit-dialog').then((m) => m.TodoEditDialog),
  { ssr: false },
)

/** The fields a board card needs (serialisable from the server page). */
export interface TodoBoardItem {
  id: string
  version: string
  title: string
  notesMd: string | null
  status: string
  priority: number
  dueAt: string | null
  applicationId: string | null
  tags: string[]
}

const COLUMNS: readonly BoardColumnDef<TodoBoardStatus>[] = [
  { id: 'open', title: TODO_STATUS_LABELS.open, tone: TODO_STATUS_TONE.open, emptyText: 'Nothing queued' },
  {
    id: 'in_progress',
    title: TODO_STATUS_LABELS.in_progress,
    tone: TODO_STATUS_TONE.in_progress,
    wipLimit: 3,
    hint: 'What you are working on now. Keep it short.',
    emptyText: 'Pick something up',
  },
  {
    id: 'waiting',
    title: TODO_STATUS_LABELS.waiting,
    tone: TODO_STATUS_TONE.waiting,
    hint: 'Blocked on someone else: a reply, a decision, a date.',
    emptyText: 'Not waiting on anyone',
  },
  { id: 'done', title: TODO_STATUS_LABELS.done, tone: TODO_STATUS_TONE.done, emptyText: 'Nothing finished yet' },
]

const PRIORITY: Record<number, { label: string; variant: 'secondary' | 'warning' | 'danger' } | undefined> = {
  1: { label: 'Low', variant: 'secondary' },
  2: { label: 'Med', variant: 'warning' },
  3: { label: 'High', variant: 'danger' },
}

interface TodosBoardProps {
  todos: TodoBoardItem[]
  applicationLabels: Record<string, string>
  /** Total done todos (the Done column shows the most recent ones). */
  doneTotal: number
  /** `Date.now()` snapshot from the server, for overdue. */
  now: number
}

export function TodosBoard({ todos, applicationLabels, doneTotal, now }: TodosBoardProps) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<TodoBoardItem | null>(null)
  const [deleting, setDeleting] = React.useState<TodoBoardItem | null>(null)
  const [removing, setRemoving] = React.useState(false)

  const items = React.useMemo(
    () =>
      groupBy(todos, TODO_BOARD_STATUSES, (t) =>
        (TODO_BOARD_STATUSES as readonly string[]).includes(t.status) ? (t.status as TodoBoardStatus) : null,
      ),
    [todos],
  )

  const remove = async (todo: TodoBoardItem): Promise<void> => {
    setRemoving(true)
    try {
      const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Todo deleted')
        setDeleting(null)
        router.refresh()
      } else {
        toast.error('Could not delete the todo.')
      }
    } catch {
      toast.error('Network error: could not delete the todo.')
    } finally {
      setRemoving(false)
    }
  }

  const renderCard = (t: TodoBoardItem): React.ReactNode => {
    const done = t.status === 'done'
    const overdue = !done && t.dueAt !== null && new Date(t.dueAt).getTime() < now
    const priority = PRIORITY[t.priority]
    const appLabel = t.applicationId ? applicationLabels[t.applicationId] : undefined
    return (
      <>
        <div className={cn('font-medium leading-snug', done && 'text-muted-foreground line-through')}>
          {t.title}
        </div>
        {t.notesMd ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.notesMd}</div> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {priority ? (
            <Badge variant={priority.variant} className="text-[10px]">
              {priority.label}
            </Badge>
          ) : null}
          {t.dueAt ? (
            <span
              className={cn(
                'rounded-md border px-1.5 py-0.5',
                overdue ? 'border-danger/30 bg-danger-soft text-danger' : 'border-border',
              )}
              suppressHydrationWarning
            >
              {overdue ? 'overdue' : 'due'} · {relativeFromNow(t.dueAt)}
            </span>
          ) : null}
          {appLabel ? (
            <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
              <Briefcase className="size-3" aria-hidden="true" />
              {appLabel}
            </span>
          ) : null}
          {t.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              #{tag}
            </Badge>
          ))}
        </div>
      </>
    )
  }

  const cardActions = (t: TodoBoardItem): BoardQuickAction[] => {
    const actions: BoardQuickAction[] = [
      { label: 'Edit', icon: Pencil, onSelect: () => setEditing(t) },
    ]
    if (t.applicationId) {
      actions.push({ label: 'Open application', icon: Briefcase, href: `/applications/${t.applicationId}` })
    }
    actions.push({ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setDeleting(t) })
    return actions
  }

  return (
    <>
      <Board
        id="todos"
        label="Todos board"
        columns={COLUMNS}
        items={items}
        totals={{ done: doneTotal }}
        columnFooter={(column, shown, total) =>
          column === 'done' && total > shown ? (
            <Link href="/todos?status=done&view=list" className="hover:text-foreground hover:underline">
              Showing {shown} of {total}. See all done
            </Link>
          ) : null
        }
        itemLabel={(t) => t.title}
        renderCard={renderCard}
        cardActions={cardActions}
        applyMove={(t, to) => ({ ...t, status: to })}
        onMove={(t, _from, to) => moveTodo(t.id, to)}
        successMessage={(_t, to) =>
          to.id === 'done' ? 'Done. Nice work.' : `Moved to ${to.title}`
        }
      />
      {editing ? (
        <TodoEditDialog
          todo={{
            id: editing.id,
            title: editing.title,
            notesMd: editing.notesMd,
            priority: editing.priority,
            dueAt: editing.dueAt,
          }}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete todo?"
        description={<p>&ldquo;{deleting?.title}&rdquo; will be permanently deleted.</p>}
        pending={removing}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
    </>
  )
}
