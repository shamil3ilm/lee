'use client'
import * as React from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InterestStars } from '@/components/interest-stars'
import { cn } from '@/lib/utils'
import { relativeFromNow, shortDate } from '@/lib/ui/date'
import {
  APPLICATION_STATUSES,
  STATUS_BADGE,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'

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

export function ApplicationsTable({ rows }: ApplicationsTableProps) {
  const [filter, setFilter] = React.useState<'all' | ApplicationStatus>('all')
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
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground',
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
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Briefcase className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No applications match this filter.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/applications/new">Add application</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
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
                  <tr key={r.id} className="border-t transition-colors hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium">
                      {r.job.company?.name ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Link className="hover:underline" href={`/applications/${r.id}`}>
                        {r.job.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_BADGE[s]}>{STATUS_LABELS[s]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.appliedAt ? shortDate(r.appliedAt) : '—'}
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
      )}
    </div>
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
        className="inline-flex items-center gap-1 hover:text-foreground"
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
