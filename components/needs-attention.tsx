import Link from 'next/link'
import { Bell, CheckCircle2, Sparkles } from 'lucide-react'
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

interface NeedsAttentionProps {
  items: AttentionItem[]
  /** Total applications the user has, used to distinguish "brand new" from "all caught up". */
  totalApplications: number
}

export function NeedsAttention({ items, totalApplications }: NeedsAttentionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Needs attention</CardTitle>
        </div>
        <Badge variant="secondary">{items.length}</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <EmptyBlock isBrandNew={totalApplications === 0} />
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/applications/${it.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md py-2 text-sm transition-colors hover:bg-accent/60 sm:grid-cols-[1fr_120px_auto] sm:px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyBlock({ isBrandNew }: { isBrandNew: boolean }) {
  if (isBrandNew) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Sparkles className="size-6 text-primary" />
        <div className="space-y-1">
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
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <CheckCircle2 className="size-6 text-emerald-500" />
      <p className="text-sm font-medium">You&apos;re all caught up.</p>
      <p className="text-xs text-muted-foreground">
        Nothing urgent in the next 3 days.
      </p>
    </div>
  )
}
