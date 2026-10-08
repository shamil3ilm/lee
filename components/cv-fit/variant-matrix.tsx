import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MatrixView } from '@/lib/cv-fit/matrix'
import { cn } from '@/lib/utils'

/**
 * Which CV covers which jobs: the open postings (best Match Score first) ×
 * your variants, each cell the variant's fit for that job; the best CV per
 * row is marked. Scrolls sideways on phones (the Table wrapper).
 */
export function VariantMatrix({ view }: { view: MatrixView }) {
  if (view.variants.length === 0 || view.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {view.variants.length === 0 ? 'Create a variant to see which jobs it fits.' : 'No open postings to compare yet.'}
      </p>
    )
  }
  return (
    <div className="space-y-2" data-testid="variant-matrix">
      <Table>
        <caption className="sr-only">Fit of each résumé variant for your open postings; the best one per posting is marked.</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Posting</TableHead>
            {view.variants.map((v) => (
              <TableHead key={v.id} className="min-w-24 text-right">
                <Link href={`/settings/variants/${v.id}`} className="hover:underline">
                  {v.name}
                </Link>
                <span className="block text-[11px] font-normal text-muted-foreground tabular-nums">best for {view.bestCounts[v.id] ?? 0}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rows.map((r) => (
            <TableRow key={r.discoveryId}>
              <TableCell>
                <Link href={`/discoveries/${r.discoveryId}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <span className="block text-xs text-muted-foreground">{r.company}</span>
              </TableCell>
              {view.variants.map((v, i) => {
                const best = r.best === v.id
                return (
                  <TableCell key={v.id} className={cn('text-right tabular-nums', best && 'bg-success-soft font-semibold text-success')}>
                    {r.fits[i] ?? '—'}
                    {best ? <span className="sr-only"> (best CV)</span> : null}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
