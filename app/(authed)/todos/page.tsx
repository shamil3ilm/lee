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

export const dynamic = 'force-dynamic'

interface TodosPageProps {
  searchParams: Promise<{ status?: string | string[]; filter?: string | string[] }>
}

/**
 * /todos — grouped todo list. Filter chips select which status subset to
 * render; quick-add form sits above the list. Applications the user
 * currently has are joined once so linked todos show a friendly label.
 */
export default async function TodosPage({ searchParams }: TodosPageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  // Snapshot once per request so `Date.now()` isn't called during a
  // "render" (react-hooks/purity flags direct impure calls at JSX sites).
  const now = new Date().getTime()
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  const status: todosQ.TodoStatus = todosQ.isTodoStatus(rawStatus ?? '')
    ? (rawStatus as todosQ.TodoStatus)
    : 'open'
  const filter = typeof params.filter === 'string' ? params.filter : undefined
  const opts: todosQ.ListTodosOpts = { status }
  if (filter === 'today') {
    // Today = due within 24h (also surfaces overdue since dueWithin is
    // inclusive of past times).
    opts.dueWithin = { hours: 24 }
  } else if (filter === 'week') {
    opts.dueWithin = { hours: 24 * 7 }
  }

  const [todos, apps] = await Promise.all([
    todosQ.list(userId, opts),
    appsQ.list(userId),
  ])
  const applicationLabels = Object.fromEntries(
    apps.map((a) => [a.id, `${a.job.company?.name ?? a.job.title}`]),
  )

  const openCount = todos.filter((t) => t.status === 'open').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Todos"
        description="Plan the next move — link a todo to any application, contact, or company."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FilterChip href="/todos" current={!filter && status === 'open'} label="All open" />
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
        }
      />

      <Card>
        <CardContent className="pt-6">
          <TodoForm />
        </CardContent>
      </Card>

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
    </div>
  )
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
