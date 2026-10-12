import Link from 'next/link'
import { Star } from 'lucide-react'
import type { CoverageRowView } from './coverage-panel'
import { coverageSummary, COVERAGE_WORD } from '@/lib/coverage/summary'
import { cn } from '@/lib/utils'

const DOT: Readonly<Record<CoverageRowView['status'], string>> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-danger',
}

const linkCls = 'font-medium text-primary underline-offset-2 hover:underline'

/**
 * One compact line on Discovery's job list: per starred region (cities rolled
 * up), "UAE · 4 sources incl. 2 alerts · 12 jobs this week", linking to
 * Settings › Sources › Coverage. Without starred regions it asks for them.
 */
export function CoverageLine({ rows, from = '/discoveries' }: { rows: CoverageRowView[]; from?: string }) {
  const back = encodeURIComponent(from)
  if (rows.length === 0) {
    return (
      <p data-testid="coverage-line" data-empty="" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Star className="size-3.5 shrink-0" aria-hidden="true" />
        <Link href={`/settings/search?from=${back}#preferred-regions`} className={linkCls}>
          Star your top regions to see coverage
        </Link>
      </p>
    )
  }
  const boards = rows.reduce((n, r) => n + r.employerBoards, 0)
  return (
    <div
      role="note"
      aria-label="Region coverage"
      data-testid="coverage-line"
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {rows.map((r) => (
        <span key={r.id} className="inline-flex items-center gap-1.5" title={r.why}>
          <span className={cn('size-2 shrink-0 rounded-full', DOT[r.status])} aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">{r.label}</span>
            <span className="sr-only"> coverage {COVERAGE_WORD[r.status]}</span> · {coverageSummary(r)}
          </span>
        </span>
      ))}
      {boards > 0 ? (
        // The weekly board auto-detect: turned on from Settings › Sources › Coverage.
        <Link href={`/settings/sources?from=${back}#coverage`} className={linkCls} data-testid="coverage-boards-found">
          {boards} employer {boards === 1 ? 'board' : 'boards'} found — turn on
        </Link>
      ) : rows.some((r) => r.status !== 'green') ? (
        <Link href={`/settings/sources?from=${back}#coverage`} className={linkCls}>
          Improve coverage
        </Link>
      ) : null}
    </div>
  )
}
