import Link from 'next/link'
import type { CoverageRowView } from './coverage-panel'
import { cn } from '@/lib/utils'

const DOT: Readonly<Record<CoverageRowView['status'], string>> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-danger',
}

const WORD: Readonly<Record<CoverageRowView['status'], string>> = { green: 'good', amber: 'low', red: 'none' }

/**
 * One line in Discovery / Companies: "Kuwait coverage: none · 0 sources · 0
 * jobs this week — Fix" for the starred regions (else the weakest ones),
 * linking to Settings › Sources › Coverage.
 */
export function CoverageLine({ rows, what = 'jobs' }: { rows: CoverageRowView[]; what?: 'jobs' | 'companies' }) {
  if (rows.length === 0) return null
  return (
    <div
      role="note"
      aria-label="Region coverage"
      data-testid="coverage-line"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-card/40 px-3 py-2 text-xs text-muted-foreground"
    >
      {rows.map((r) => (
        <span key={r.id} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', DOT[r.status])} aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">{r.label} coverage</span>: {WORD[r.status]} ·{' '}
            {r.regionSources} {r.regionSources === 1 ? 'source' : 'sources'} ·{' '}
            {what === 'jobs' ? `${r.kept} ${r.kept === 1 ? 'job' : 'jobs'} this week` : `${r.companies} ${r.companies === 1 ? 'company' : 'companies'}`}
          </span>
        </span>
      ))}
      {rows.some((r) => r.status !== 'green') ? (
        <Link href="/settings/sources?from=%2Fdiscoveries#coverage" className="ml-auto font-medium text-primary underline-offset-2 hover:underline">
          Improve coverage
        </Link>
      ) : null}
    </div>
  )
}
