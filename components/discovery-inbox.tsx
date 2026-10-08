'use client'
import * as React from 'react'
import Link from 'next/link'
import { Filter, ShieldCheck, Sparkles, Trash2, Undo2 } from 'lucide-react'
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
  dismissAllFiltered,
  dismissMultiple,
  dismissOlderThan,
  showFilteredAnyway,
} from '@/app/(authed)/discoveries/actions'
import { toastDismissedJobs } from '@/components/discovery-undo'
import { BulkMenu } from '@/components/discovery/bulk-menu'

interface JobsInboxProps {
  kind: 'jobs'
  /** The top pager; shares one row with the bulk menu. */
  pager?: React.ReactNode
  items: DiscoveryRowJob[]
  /** v17 §1 — showing the Scam Shield quarantine instead of the inbox. */
  quarantineView?: boolean
  /** Showing the relevance gate's "Filtered out" list. */
  filteredView?: boolean
}

interface CompaniesInboxProps {
  kind: 'companies'
  pager?: React.ReactNode
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
        toastDismissedJobs(`Dismissed ${result.count}`, ids)
        setSelected(new Set())
      } else {
        toast.error(result.error)
      }
    })
  }

  /** Every actionable row on this page (inbox or filtered). */
  const pageIds = items
    .filter((i) => i.status === 'new' || i.status === 'filtered')
    .map((i) => i.id)
  const filteredView = props.kind === 'jobs' && Boolean(props.filteredView)

  function handleDismissPage(): void {
    if (pageIds.length === 0) return
    startTransition(async () => {
      const result = await dismissMultiple(pageIds)
      if ('success' in result) {
        toastDismissedJobs(`Dismissed ${result.count} on this page`, pageIds)
        setSelected(new Set())
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDismissAllFiltered(): void {
    startTransition(async () => {
      const result = await dismissAllFiltered()
      if ('success' in result) toast.success(`Dismissed ${result.count} filtered postings`)
      else toast.error(result.error)
    })
  }

  function handleShowSelected(): void {
    const ids = Array.from(effectiveSelected)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await showFilteredAnyway(ids)
      if ('success' in result) {
        toast.success(`Moved ${result.count} to your inbox`)
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

  if (items.length === 0 && props.kind === 'jobs' && props.quarantineView) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Quarantine is empty"
        description="Postings that Scam Shield rates “Likely scam” land here instead of your inbox. Nothing is ever deleted."
      />
    )
  }

  if (items.length === 0 && filteredView) {
    return (
      <EmptyState
        icon={Filter}
        title="Nothing filtered out"
        description="Clear mismatches (an unrelated field, a deal-breaker, a place or level you ruled out) land here with the reason. Nothing is ever deleted."
      />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No discoveries here"
        description="Discovery is fed by your sources. Add or tune them in Settings › Sources."
        action={
          <Button asChild size="sm">
            <Link href="/settings/sources">Set up sources</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-2">
      {props.kind === 'jobs' && props.quarantineView ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Quarantined by Scam Shield: likely scams and ones you confirmed. Open a badge to see why,
          mark “Not a scam” to release it, or report it.
        </p>
      ) : null}
      {filteredView ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Clear mismatches, judged from the job description and your preferences. Each shows why. “Show anyway” moves
          one to your inbox for good and teaches lee the title.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">{props.pager}</div>
        {isJobs ? (
          <BulkMenu
            disabled={isPending}
            pageCount={pageIds.length}
            filteredView={filteredView}
            olderThanDays={OLDER_THAN_DAYS}
            onDismissPage={handleDismissPage}
            onDismissAllFiltered={handleDismissAllFiltered}
            onDismissOlder={handleDismissOlder}
          />
        ) : null}
      </div>
      {isJobs && effectiveSelected.size > 0 ? (
        <div
          className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-xs shadow-sm"
          data-testid="bulk-bar"
        >
          <span className="text-muted-foreground">{effectiveSelected.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {filteredView ? (
              <Button size="sm" variant="outline" onClick={handleShowSelected} disabled={isPending}>
                <Undo2 className="size-3.5" />
                Show selected anyway
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={handleDismissSelected} disabled={isPending}>
              <Trash2 className="size-3.5" />
              Dismiss selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={isPending}>
              Clear selection
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
