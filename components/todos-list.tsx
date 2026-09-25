'use client'
import Link from 'next/link'
import { CheckSquare } from 'lucide-react'
import type { Todo } from '@/lib/db/queries/todos'
import { TodoRow } from '@/components/todo-row'

interface TodosListProps {
  todos: Todo[]
  /** Optional map of applicationId → label so linked apps get a friendly chip. */
  applicationLabels?: Record<string, string>
  /** Hide the "linked application" chip (used on application detail). */
  hideApplicationChip?: boolean
  /** `Date.now()` snapshot from the server component; used for overdue math. */
  now: number
}

type Bucket =
  | { key: 'overdue'; title: 'Overdue' }
  | { key: 'today'; title: 'Today' }
  | { key: 'week'; title: 'This week' }
  | { key: 'later'; title: 'Later' }
  | { key: 'none'; title: 'No due date' }

const BUCKETS: Bucket[] = [
  { key: 'overdue', title: 'Overdue' },
  { key: 'today', title: 'Today' },
  { key: 'week', title: 'This week' },
  { key: 'later', title: 'Later' },
  { key: 'none', title: 'No due date' },
]

function bucketFor(todo: Todo, now: Date): Bucket['key'] {
  if (!todo.dueAt) return 'none'
  const due = new Date(todo.dueAt).getTime()
  const nowMs = now.getTime()
  if (due < nowMs) return 'overdue'
  // Today = same UTC date. Cheap: compare ISO date prefix.
  const todayIso = now.toISOString().slice(0, 10)
  const dueIso = new Date(due).toISOString().slice(0, 10)
  if (dueIso === todayIso) return 'today'
  const weekEnd = nowMs + 7 * 24 * 60 * 60 * 1000
  if (due <= weekEnd) return 'week'
  return 'later'
}

/**
 * Groups todos into overdue/today/this-week/later/no-due sections, with a
 * compact header per group and TodoRow renderings inside.
 */
export function TodosList({
  todos,
  applicationLabels = {},
  hideApplicationChip = false,
  now,
}: TodosListProps) {
  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-sm text-muted-foreground">
        <CheckSquare className="size-6" />
        <p className="font-medium text-foreground">Inbox zero.</p>
        <p>Add a todo above to get started.</p>
        {hideApplicationChip ? null : (
          <p>
            Or review your{' '}
            <Link href="/applications" className="text-primary hover:underline">
              Applications
            </Link>{' '}
            for the next step to plan.
          </p>
        )}
      </div>
    )
  }

  const nowDate = new Date(now)
  const byBucket = new Map<Bucket['key'], Todo[]>()
  for (const t of todos) {
    const key = bucketFor(t, nowDate)
    const arr = byBucket.get(key) ?? []
    arr.push(t)
    byBucket.set(key, arr)
  }

  return (
    <div className="space-y-5">
      {BUCKETS.map(({ key, title }) => {
        const bucket = byBucket.get(key) ?? []
        if (bucket.length === 0) return null
        return (
          <section key={key} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {bucket.length}
              </span>
            </div>
            <ul className="space-y-2">
              {bucket.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  now={now}
                  applicationLabel={
                    hideApplicationChip
                      ? undefined
                      : t.applicationId
                        ? (applicationLabels[t.applicationId] ?? null)
                        : null
                  }
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
