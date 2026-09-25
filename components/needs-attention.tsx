'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Bell,
  CheckCircle2,
  CheckSquare,
  Clock,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { relativeFromNow, shortDate } from '@/lib/ui/date'
import {
  STATUS_BADGE,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'

export interface AttentionItem {
  id: string
  title: string
  companyName: string | null
  status: ApplicationStatus
  nextActionAt: string | null
}

// v4.2 — surfaced from the `followup_recommended` activity written by the
// cron sweep. Kept as a separate item type so the row can render a distinct
// icon + inline "Draft follow-up" action.
export interface FollowupNudge {
  applicationId: string
  jobTitle: string
  companyName: string | null
  daysSince: number
  suggestedInterval: 7 | 14 | 21 | 30
  recommendedAt: string
}

// v8 — top-N open todos due today or overdue. Rendered as a distinct row set
// alongside application attention items and follow-ups.
export interface TodoNudge {
  id: string
  title: string
  priority: number
  dueAt: string | null
  applicationId: string | null
}

interface NeedsAttentionProps {
  items: AttentionItem[]
  followups?: FollowupNudge[]
  todos?: TodoNudge[]
  /** Total applications the user has, used to distinguish "brand new" from "all caught up". */
  totalApplications: number
}

export function NeedsAttention({
  items,
  followups = [],
  todos = [],
  totalApplications,
}: NeedsAttentionProps) {
  const totalCount = items.length + followups.length + todos.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Needs attention</CardTitle>
        </div>
        <Badge variant="secondary">{totalCount}</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {totalCount === 0 ? (
          <EmptyBlock isBrandNew={totalApplications === 0} totalApplications={totalApplications} />
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((it) => (
              <li key={`att-${it.id}`}>
                <Link
                  href={`/applications/${it.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/60 sm:grid-cols-[1fr_120px_auto] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.companyName ?? 'Unknown'}</div>
                    <div className="truncate text-xs text-muted-foreground">{it.title}</div>
                  </div>
                  <div className="hidden text-xs text-muted-foreground sm:block">
                    {it.nextActionAt ? (
                      <>
                        <span className="font-medium text-foreground">
                          {relativeFromNow(it.nextActionAt)}
                        </span>{' '}
                        · {shortDate(it.nextActionAt)}
                      </>
                    ) : null}
                  </div>
                  <Badge variant={STATUS_BADGE[it.status]} className="justify-self-end">
                    {STATUS_LABELS[it.status]}
                  </Badge>
                </Link>
              </li>
            ))}
            {followups.map((f) => (
              <FollowupRow key={`fup-${f.applicationId}-${f.suggestedInterval}`} nudge={f} />
            ))}
            {todos.map((t) => (
              <TodoNudgeRow key={`todo-${t.id}`} todo={t} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function FollowupRow({ nudge }: { nudge: FollowupNudge }): React.ReactElement {
  const router = useRouter()
  const [drafting, setDrafting] = useState(false)

  async function draft(): Promise<void> {
    setDrafting(true)
    try {
      const res = await fetch(
        `/api/applications/${nudge.applicationId}/documents/generate-followup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daysSince: nudge.suggestedInterval }),
        },
      )
      const json = (await res.json().catch(() => ({}))) as {
        documentId?: string
        error?: string
      }
      if (res.ok && json.documentId) {
        toast.success(`Day ${nudge.suggestedInterval} follow-up drafted`)
        router.refresh()
      } else {
        toast.error(json.error ?? 'Could not draft follow-up.')
      }
    } catch {
      toast.error('Network error — could not draft follow-up.')
    } finally {
      setDrafting(false)
    }
  }

  return (
    <li>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/40">
        <Clock className="size-4 shrink-0 text-violet-500" />
        <Link
          href={`/applications/${nudge.applicationId}?tab=followup`}
          className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="truncate font-medium">
            Follow up: {nudge.companyName ?? 'Unknown'}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {nudge.jobTitle} · day {nudge.daysSince}
          </div>
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void draft()
          }}
          disabled={drafting}
        >
          {drafting ? <Loader2 className="size-3 animate-spin" /> : null}
          Draft follow-up
        </Button>
      </div>
    </li>
  )
}

function TodoNudgeRow({ todo }: { todo: TodoNudge }): React.ReactElement {
  const overdue = todo.dueAt !== null && new Date(todo.dueAt).getTime() < Date.now()
  const href = todo.applicationId ? `/applications/${todo.applicationId}` : '/todos'
  return (
    <li>
      <Link
        href={href}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <CheckSquare className="size-4 shrink-0 text-emerald-500" />
        <div className="min-w-0">
          <div className="truncate font-medium">{todo.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {todo.dueAt ? (
              <>
                {overdue ? 'Overdue · ' : 'Today · '}
                {new Date(todo.dueAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </>
            ) : (
              'No due date'
            )}
          </div>
        </div>
        {todo.priority >= 2 ? (
          <Badge variant={todo.priority === 3 ? 'destructive' : 'default'}>
            {todo.priority === 3 ? 'High' : 'Med'}
          </Badge>
        ) : null}
      </Link>
    </li>
  )
}

interface EmptyBlockProps {
  isBrandNew: boolean
  totalApplications: number
}

function EmptyBlock({ isBrandNew, totalApplications }: EmptyBlockProps) {
  if (isBrandNew) {
    return (
      <div className="flex items-center gap-3 p-1">
        <Sparkles className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Get started</p>
          <p className="text-xs text-muted-foreground">
            Track your first application to see it here.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/applications/new">Add application</Link>
        </Button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 p-1">
      <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
      <p className="text-sm">
        <span className="font-medium">You&apos;re all caught up</span>
        <span className="text-muted-foreground">
          {' '}
          — {totalApplications} active application{totalApplications === 1 ? '' : 's'}
        </span>
      </p>
    </div>
  )
}
