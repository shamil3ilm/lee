'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { InterestStars } from '@/components/interest-stars'
import { cn } from '@/lib/utils'
import { relativeFromNow, shortDate } from '@/lib/ui/date'
import {
  APPLICATION_STATUSES,
  STATUS_BADGE,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'
import { setAppliedAt } from '@/app/(authed)/applications/[id]/actions'

// Statuses where applied_at is meaningful. Screen/interview/offer imply the
// user has already applied, so the backfill affordance appears there too.
const APPLIED_LIKE: readonly ApplicationStatus[] = [
  'applied',
  'screen',
  'interview',
  'offer',
]

export interface AppRow {
  id: string
  status: string
  interestLevel: number | null
  appliedAt: string | null
  nextActionAt: string | null
  job: { title: string; company: { name: string } | null }
}

type SortKey = 'company' | 'role' | 'status' | 'appliedAt' | 'nextActionAt'
type SortDir = 'asc' | 'desc'

interface ApplicationsTableProps {
  rows: AppRow[]
  /** Pre-selected status chip, e.g. from ?status= links on the journey strip. */
  initialFilter?: 'all' | ApplicationStatus
}

const FILTERS: { label: string; value: 'all' | ApplicationStatus }[] = [
  { label: 'All', value: 'all' },
  ...APPLICATION_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s })),
]

function compare(a: string | number | null, b: string | number | null, dir: SortDir): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (a < b) return dir === 'asc' ? -1 : 1
  if (a > b) return dir === 'asc' ? 1 : -1
  return 0
}

export function ApplicationsTable({ rows, initialFilter = 'all' }: ApplicationsTableProps) {
  const router = useRouter()
  const [filter, setFilter] = React.useState<'all' | ApplicationStatus>(initialFilter)
  const [sortKey, setSortKey] = React.useState<SortKey>('nextActionAt')
  const [sortDir, setSortDir] = React.useState<SortDir>('asc')

  const filtered = React.useMemo(() => {
    return filter === 'all' ? rows : rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const sorted = React.useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'company':
          return compare(a.job.company?.name ?? null, b.job.company?.name ?? null, sortDir)
        case 'role':
          return compare(a.job.title, b.job.title, sortDir)
        case 'status':
          return compare(a.status, b.status, sortDir)
        case 'appliedAt':
          return compare(
            a.appliedAt ? new Date(a.appliedAt).getTime() : null,
            b.appliedAt ? new Date(b.appliedAt).getTime() : null,
            sortDir,
          )
        case 'nextActionAt':
          return compare(
            a.nextActionAt ? new Date(a.nextActionAt).getTime() : null,
            b.nextActionAt ? new Date(b.nextActionAt).getTime() : null,
            sortDir,
          )
      }
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              filter === f.value
                ? 'border-foreground bg-foreground text-background shadow-sm'
                : 'border-border text-muted-foreground hover:border-foreground/50 hover:bg-accent/60 hover:text-foreground',
            )}
            type="button"
          >
            {f.label}
            {filter === f.value ? null : (
              <span className="ml-1 opacity-60">
                {rows.filter((r) => f.value === 'all' || r.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        rows.length === 0 ? (
          // Journey cue: nothing tracked yet → the previous step is Discovery.
          <EmptyState
            icon={Briefcase}
            title="No applications yet"
            description="Find roles worth applying to in Discovery, or add one you already have in mind."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/discoveries">Find roles in Discovery</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/applications/new">Add application</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No applications match this filter."
            description="Try a different status filter."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/applications/new">Add application</Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {/*
            Wrap the table in an overflow-x-auto scroller so 6 columns don't
            force horizontal page overflow on mobile. `min-w-[720px]` keeps
            columns readable inside the scroller; the row stays clickable.
          */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th onClick={() => toggleSort('company')} active={sortKey === 'company'} dir={sortDir}>
                  Company
                </Th>
                <Th onClick={() => toggleSort('role')} active={sortKey === 'role'} dir={sortDir}>
                  Role
                </Th>
                <Th onClick={() => toggleSort('status')} active={sortKey === 'status'} dir={sortDir}>
                  Status
                </Th>
                <Th onClick={() => toggleSort('appliedAt')} active={sortKey === 'appliedAt'} dir={sortDir}>
                  Applied
                </Th>
                <Th
                  onClick={() => toggleSort('nextActionAt')}
                  active={sortKey === 'nextActionAt'}
                  dir={sortDir}
                >
                  Next action
                </Th>
                <th className="px-3 py-2 text-right">Interest</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const s = (APPLICATION_STATUSES as readonly string[]).includes(r.status)
                  ? (r.status as ApplicationStatus)
                  : 'saved'
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/applications/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/applications/${r.id}`)
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open ${r.job.title} at ${r.job.company?.name ?? 'Unknown'}`}
                    className="cursor-pointer border-t transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-accent/60"
                  >
                    <td className="px-3 py-2 font-medium">
                      {r.job.company?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-foreground/90">{r.job.title}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_BADGE[s]}>{STATUS_LABELS[s]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.appliedAt ? (
                        shortDate(r.appliedAt)
                      ) : (APPLIED_LIKE as readonly string[]).includes(r.status) ? (
                        <AppliedAtBackfill applicationId={r.id} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.nextActionAt ? (
                        <span>
                          <span className="text-foreground">{relativeFromNow(r.nextActionAt)}</span>
                          <span className="ml-1 text-xs">· {shortDate(r.nextActionAt)}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end">
                        <InterestStars level={r.interestLevel} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

interface AppliedAtBackfillProps {
  applicationId: string
}

/**
 * Inline date picker for backfilling `applied_at` on rows whose status implies
 * the user applied but where the timestamp was never captured (usually because
 * the app was added to the tracker after-the-fact). onClick + onChange stop
 * propagation so opening the picker doesn't trigger the row-level navigation.
 */
function AppliedAtBackfill({ applicationId }: AppliedAtBackfillProps) {
  const [value, setValue] = React.useState('')
  const [pending, start] = React.useTransition()

  function handleChange(next: string): void {
    setValue(next)
    if (!next) return
    start(async () => {
      const result = await setAppliedAt(applicationId, next)
      if ('success' in result) toast.success('Applied date set')
      else toast.error(result.error)
    })
  }

  return (
    <input
      type="date"
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation()
        handleChange(e.target.value)
      }}
      aria-label="Set applied date"
      className="w-32 rounded border bg-background px-1.5 py-0.5 text-xs text-foreground disabled:opacity-60"
    />
  )
}

interface ThProps {
  onClick: () => void
  active: boolean
  dir: SortDir
  children: React.ReactNode
}

function Th({ onClick, active, dir, children }: ThProps) {
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
        {!active ? (
          <ArrowUpDown className="size-3 opacity-50" />
        ) : dir === 'asc' ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )}
      </button>
    </th>
  )
}
