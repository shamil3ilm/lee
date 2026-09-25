'use client'
import * as React from 'react'
import Link from 'next/link'
import { Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import {
  JobDiscoveryRow,
  CompanyDiscoveryRow,
  type DiscoveryRowJob,
  type DiscoveryRowCompany,
} from '@/components/discovery-row'
import {
  dismissMultiple,
  dismissOlderThan,
} from '@/app/(authed)/discoveries/actions'

interface JobsInboxProps {
  kind: 'jobs'
  items: DiscoveryRowJob[]
}

interface CompaniesInboxProps {
  kind: 'companies'
  items: DiscoveryRowCompany[]
}

type DiscoveryInboxProps = JobsInboxProps | CompaniesInboxProps

const OLDER_THAN_DAYS = 7

export function DiscoveryInbox(props: DiscoveryInboxProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [isPending, startTransition] = React.useTransition()

  // Bulk actions only apply to job discoveries in this pass — companies
  // remain single-select. This keeps the server surface small; the two flows
  // rarely need each other.
  const isJobs = props.kind === 'jobs'
  const items = props.items

  // Derive the effective selection during render so stale ids that no longer
  // exist in `items` are ignored on read — no setState-in-effect required.
  const effectiveSelected = React.useMemo(() => {
    const ids = new Set(items.map((i) => i.id))
    const next = new Set<string>()
    for (const id of selected) if (ids.has(id)) next.add(id)
    return next
  }, [selected, items])

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDismissSelected(): void {
    const ids = Array.from(effectiveSelected)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await dismissMultiple(ids)
      if ('success' in result) {
        toast.success(`Dismissed ${result.count}`)
        setSelected(new Set())
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDismissOlder(): void {
    startTransition(async () => {
      const result = await dismissOlderThan(OLDER_THAN_DAYS)
      if ('success' in result) {
        toast.success(
          result.count > 0
            ? `Dismissed ${result.count} older than ${OLDER_THAN_DAYS}d`
            : `Nothing older than ${OLDER_THAN_DAYS}d`,
        )
      } else {
        toast.error(result.error)
      }
    })
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No discoveries here"
        description="Add sources at Settings → Sources to start feeding the pipeline."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/sources">Manage sources</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-2">
      {isJobs ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            {effectiveSelected.size > 0 ? (
              <span>{effectiveSelected.size} selected</span>
            ) : (
              <span>Select rows to bulk-dismiss.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {effectiveSelected.size > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismissSelected}
                disabled={isPending}
              >
                <Trash2 className="size-3.5" />
                Dismiss selected
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismissOlder}
              disabled={isPending}
            >
              Dismiss older than {OLDER_THAN_DAYS}d
            </Button>
          </div>
        </div>
      ) : null}

      {props.kind === 'jobs'
        ? props.items.map((it) => (
            <JobDiscoveryRow
              key={it.id}
              item={it}
              selected={effectiveSelected.has(it.id)}
              onToggleSelect={() => toggle(it.id)}
            />
          ))
        : props.items.map((it) => <CompanyDiscoveryRow key={it.id} item={it} />)}
    </div>
  )
}
