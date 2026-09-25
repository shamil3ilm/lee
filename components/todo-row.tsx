'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Briefcase, Loader2, Trash2 } from 'lucide-react'
import type { Todo } from '@/lib/db/queries/todos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { relativeFromNow } from '@/lib/ui/date'
import { cn } from '@/lib/utils'

interface TodoRowProps {
  todo: Todo
  applicationLabel?: string | null
}

const PRIORITY_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Low',
  2: 'Med',
  3: 'High',
}

const PRIORITY_VARIANT = {
  0: 'outline',
  1: 'secondary',
  2: 'default',
  3: 'destructive',
} as const

/**
 * Single row rendering of a todo. Checkbox flips status via /api/todos/[id]
 * with `{toggle: true}`; delete removes with a confirm-less click (small
 * items — undo via re-create is trivial and the button sits behind an
 * intent icon so accidental taps are rare).
 */
export function TodoRow({ todo, applicationLabel }: TodoRowProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isDone = todo.status === 'done'
  const overdue =
    todo.dueAt !== null && !isDone && new Date(todo.dueAt).getTime() < Date.now()

  async function toggle(): Promise<void> {
    setPending(true)
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle: true }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(json.error ?? 'Could not update todo.')
      }
    } catch {
      toast.error('Network error — could not update todo.')
    } finally {
      setPending(false)
    }
  }

  async function remove(): Promise<void> {
    setRemoving(true)
    try {
      const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Todo deleted')
        router.refresh()
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(json.error ?? 'Could not delete todo.')
      }
    } catch {
      toast.error('Network error — could not delete todo.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
      <label
        className="mt-1 inline-flex cursor-pointer items-center"
        aria-label={isDone ? 'Mark as open' : 'Mark as done'}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={isDone}
          disabled={pending}
          onChange={toggle}
        />
        <span
          aria-hidden="true"
          className={cn(
            'grid size-4 place-items-center rounded border transition-colors',
            isDone
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 bg-background hover:border-primary',
            pending && 'opacity-50',
          )}
        >
          {isDone ? '✓' : null}
        </span>
      </label>
      <div className="min-w-0">
        <div
          className={cn(
            'font-medium leading-snug',
            isDone && 'text-muted-foreground line-through',
          )}
        >
          {todo.title}
        </div>
        {todo.notesMd ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {todo.notesMd}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {todo.priority > 0 ? (
            <Badge
              variant={PRIORITY_VARIANT[todo.priority as 0 | 1 | 2 | 3] ?? 'outline'}
              className="text-[10px]"
            >
              {PRIORITY_LABEL[todo.priority] ?? PRIORITY_LABEL[0]}
            </Badge>
          ) : null}
          {todo.dueAt ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
                overdue
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200'
                  : 'border-border',
              )}
              title={new Date(todo.dueAt).toLocaleString()}
            >
              {overdue ? 'overdue' : 'due'} · {relativeFromNow(todo.dueAt)}
            </span>
          ) : null}
          {todo.applicationId && applicationLabel !== undefined ? (
            <Link
              href={`/applications/${todo.applicationId}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 hover:bg-accent"
            >
              <Briefcase className="size-3" />
              {applicationLabel ?? 'application'}
            </Link>
          ) : null}
          {todo.tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              #{t}
            </Badge>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Delete todo"
        onClick={() => {
          void remove()
        }}
        disabled={removing}
      >
        {removing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </Button>
    </li>
  )
}
