import Link from 'next/link'
import { CheckCircle2, Circle, CircleDot, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import type { ProblemFilters, ProblemPage, ProblemStatus } from '@/lib/academy/coding/list'
import { filterHref } from '@/lib/academy/coding/list'
import { joinMeta } from '@/lib/ui/meta'
import { DIFFICULTY_LABELS } from '@/lib/academy/problems/constants'
import { DIFFICULTY_TONE, formatMs, ROLE_LABELS, STATUS_LABELS, TOPIC_LABELS } from './labels'

const STATUS_ICON: Readonly<Record<ProblemStatus, typeof Circle>> = { todo: Circle, attempted: CircleDot, solved: CheckCircle2 }
const STATUS_CLASS: Readonly<Record<ProblemStatus, string>> = {
  todo: 'text-muted-foreground',
  attempted: 'text-warning',
  solved: 'text-success',
}

/** Columns shown only when the content area is at least ~900px wide (@4xl = 56rem). */
const WIDE = 'hidden @4xl/main:table-cell'

/** The problem set table (server component); the wrapper scrolls on phones. */
export function ProblemTable({ page, filters }: { page: ProblemPage; filters: ProblemFilters }) {
  if (page.total === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No problems match"
        description="Clear a filter or search for something else."
        action={
          <Link href="/playground/problems" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Clear filters
          </Link>
        }
      />
    )
  }
  return (
    <div className="space-y-3">
      <Table aria-label="Problems">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>Problem</TableHead>
            <TableHead className={WIDE}>Topics</TableHead>
            <TableHead className="w-24">Difficulty</TableHead>
            <TableHead className={`${WIDE} w-28 text-right`}>Acceptance</TableHead>
            <TableHead className={`${WIDE} w-28 text-right`}>Best runtime</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((r) => {
            const Icon = STATUS_ICON[r.status]
            return (
              <TableRow key={r.slug} data-testid="problem-row">
                <TableCell>
                  <Icon className={`size-4 ${STATUS_CLASS[r.status]}`} aria-label={STATUS_LABELS[r.status]} role="img" />
                </TableCell>
                {/* w-full + max-w-0: the title cell takes the leftover width and
                    truncates instead of wrapping to four lines on tablets. */}
                <TableCell className="w-full max-w-0">
                  <Link
                    href={`/playground/problems/${r.slug}`}
                    title={r.title}
                    className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {r.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums @4xl/main:hidden" data-testid="problem-meta">
                    {joinMeta([
                      r.acceptance === null ? null : `${r.acceptance}% accepted`,
                      r.bestRuntimeMs === null ? null : `Best ${formatMs(r.bestRuntimeMs)}`,
                      r.topics.slice(0, 2).map((t) => TOPIC_LABELS[t]).join(', ') || null,
                    ])}
                  </p>
                  {r.roles.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.roles.map((role) => (
                        <Badge key={role} variant="outline" className="text-[11px]">
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className={WIDE}>
                  <div className="flex flex-wrap gap-1">
                    {r.topics.map((t) => (
                      <Link key={t} href={filterHref(filters, { topic: t })} className="rounded-sm">
                        <Badge variant="secondary" className="text-[11px]">
                          {TOPIC_LABELS[t]}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={DIFFICULTY_TONE[r.difficulty]}>{DIFFICULTY_LABELS[r.difficulty]}</Badge>
                </TableCell>
                <TableCell className={`${WIDE} text-right tabular-nums`}>
                  {r.acceptance === null ? '—' : `${r.acceptance}%`}
                  {r.submissions > 0 ? <span className="block text-[11px] text-muted-foreground">{r.accepted}/{r.submissions}</span> : null}
                </TableCell>
                <TableCell className={`${WIDE} text-right tabular-nums`}>{formatMs(r.bestRuntimeMs)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {page.total} problem{page.total === 1 ? '' : 's'} · page {page.page} of {page.pages}
        </span>
        <div className="flex gap-2">
          {page.page > 1 ? (
            <Link className="rounded-md border px-3 py-1.5 hover:bg-accent" href={filterHref(filters, { page: page.page - 1 })} rel="prev">
              Previous
            </Link>
          ) : null}
          {page.page < page.pages ? (
            <Link className="rounded-md border px-3 py-1.5 hover:bg-accent" href={filterHref(filters, { page: page.page + 1 })} rel="next">
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  )
}
