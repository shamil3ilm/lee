import Link from 'next/link'
import { CheckSquare } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as todosQ from '@/lib/db/queries/todos'
import * as appsQ from '@/lib/db/queries/applications'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TodoForm } from '@/components/todo-form'
import { TodosList } from '@/components/todos-list'
import { TodosBoard, type TodoBoardItem } from '@/components/todos-board'
import { BoardViewToggle } from '@/components/board/view-toggle'
import { parseBoardView, viewHref } from '@/lib/board/view'
import { TODO_ACTIVE_STATUSES, isActiveTodoStatus } from '@/lib/todos/status'

export const dynamic = 'force-dynamic'

/** Done cards shown on the board; the rest are one click away in the list. */
const BOARD_DONE_LIMIT = 30

interface TodosPageProps {
  searchParams: Promise<{
    status?: string | string[]
    filter?: string | string[]
    view?: string | string[]
  }>
}

/**
 * /todos: grouped todo list, or the To do / In progress / Waiting / Done
 * board (`?view=board`). Filter chips select which status subset the list
 * renders; the quick-add form sits above both views. Applications the user
 * currently has are joined once so linked todos show a friendly label.
 */
export default async function TodosPage({ searchParams }: TodosPageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  // Snapshot once per request so `Date.now()` isn't called during a
  // "render" (react-hooks/purity flags direct impure calls at JSX sites).
  const now = new Date().getTime()
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  // No status: every active todo (open, in progress, waiting).
  const status: todosQ.TodoStatus | null = todosQ.isTodoStatus(rawStatus ?? '')
    ? (rawStatus as todosQ.TodoStatus)
    : null
  const filter = typeof params.filter === 'string' ? params.filter : undefined
  const { view, explicit } = parseBoardView(params.view, 'list')
  const opts: todosQ.ListTodosOpts = status ? { status } : { statuses: TODO_ACTIVE_STATUSES }
  if (filter === 'today') {
    // Today = due within 24h (also surfaces overdue since dueWithin is
    // inclusive of past times).
    opts.dueWithin = { hours: 24 }
  } else if (filter === 'week') {
    opts.dueWithin = { hours: 24 * 7 }
  }

  const board = view === 'board'
  const [todos, apps, doneTotal] = await Promise.all([
    board
      ? todosQ.listForBoard(userId, { doneLimit: BOARD_DONE_LIMIT })
      : todosQ.list(userId, opts),
    appsQ.list(userId),
    board ? todosQ.countDone(userId) : Promise.resolve(0),
  ])
  const applicationLabels = Object.fromEntries(
    apps.map((a) => [a.id, `${a.job.company?.name ?? a.job.title}`]),
  )

  const openCount = todos.filter((t) => isActiveTodoStatus(t.status)).length
  const toggle = (
    <BoardViewToggle
      page="todos"
      current={view}
      defaultView="list"
      explicit={explicit}
      boardHref={viewHref('/todos', {}, 'board')}
      listHref={viewHref('/todos', params, 'list')}
    />
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Todos"
        description="Plan the next move: link a todo to any application, contact, or company."
        actions={
          board ? (
            toggle
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {toggle}
              <FilterChip href="/todos" current={!filter && !status} label="All open" />
              <FilterChip
                href="/todos?filter=today"
                current={filter === 'today'}
                label="Today"
              />
              <FilterChip
                href="/todos?filter=week"
                current={filter === 'week'}
                label="This week"
              />
              <FilterChip
                href="/todos?status=done"
                current={status === 'done'}
                label="Done"
              />
            </div>
          )
        }
      />

      <Card>
        <CardContent className="pt-6">
          <TodoForm />
        </CardContent>
      </Card>

      {board ? (
        <TodosBoard
          todos={todos.map(toBoardItem)}
          applicationLabels={applicationLabels}
          doneTotal={doneTotal}
          now={now}
        />
      ) : (
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {status === 'done' ? 'Completed todos' : 'Your todos'}
            </h2>
            <span className="text-xs text-muted-foreground">
              {status === 'done'
                ? `${todos.length} completed`
                : `${openCount} open · ${todos.length} shown`}
            </span>
          </div>
          {todos.length === 0 && status === 'done' ? (
            <EmptyState icon={CheckSquare} title="No completed todos yet." />
          ) : (
            <TodosList todos={todos} applicationLabels={applicationLabels} now={now} />
          )}
        </div>
      )}
    </div>
  )
}

function toBoardItem(t: todosQ.Todo): TodoBoardItem {
  return {
    id: t.id,
    version: t.updatedAt.toISOString(),
    title: t.title,
    notesMd: t.notesMd,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    applicationId: t.applicationId,
    tags: t.tags,
  }
}

function FilterChip({
  href,
  current,
  label,
}: {
  href: string
  current: boolean
  label: string
}) {
  return (
    <Button asChild variant={current ? 'default' : 'outline'} size="sm">
      <Link href={href}>{label}</Link>
    </Button>
  )
}
