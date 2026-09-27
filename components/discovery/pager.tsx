import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { pageCount, pageItems, rangeLabel } from '@/lib/discovery/pager'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'
import { PageSizeSelect } from './page-size-select'

interface DiscoveryPagerProps {
  searchParams: Record<string, string | undefined>
  page: number
  size: number
  total: number
  /** Distinguishes the top and bottom pagers for assistive tech. */
  position: 'top' | 'bottom'
}

function hrefFor(params: Record<string, string | undefined>, page: number): string {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v && k !== 'page') next.set(k, v)
  if (page > 1) next.set('page', String(page))
  const qs = next.toString()
  return qs ? `/discoveries?${qs}` : '/discoveries'
}

const itemCls = cn(
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm tabular-nums transition-colors hover:bg-muted',
  focusRing,
)

/**
 * "1–50 of 734", numbered pages with ellipses, Prev/Next, and the page-size
 * choice (25/50/100, remembered). Rendered above and below the list.
 */
export function DiscoveryPager({ searchParams, page, size, total, position }: DiscoveryPagerProps) {
  const count = pageCount(size, total)
  const items = pageItems(Math.min(page, count), count)
  return (
    <nav
      aria-label={`Discovery pages (${position})`}
      className="flex flex-wrap items-center justify-between gap-2"
      data-testid={`pager-${position}`}
    >
      <span className="text-sm text-muted-foreground tabular-nums" aria-live={position === 'top' ? 'polite' : undefined}>
        {rangeLabel(Math.min(page, count), size, total)}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {count > 1 ? (
          <>
            {page > 1 ? (
              <Link href={hrefFor(searchParams, page - 1)} className={itemCls} aria-label="Previous page" scroll={position === 'bottom'}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className={cn(itemCls, 'pointer-events-none opacity-40')} aria-hidden="true">
                <ChevronLeft className="size-4" />
              </span>
            )}
            {items.map((it, i) =>
              it === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
                  …
                </span>
              ) : (
                <Link
                  key={it}
                  href={hrefFor(searchParams, it)}
                  aria-current={it === page ? 'page' : undefined}
                  aria-label={`Page ${it}`}
                  className={cn(itemCls, it === page && 'border-primary bg-primary text-primary-foreground hover:bg-primary', it !== page && i > 0 && i < items.length - 1 && 'hidden sm:inline-flex')}
                >
                  {it}
                </Link>
              ),
            )}
            {page < count ? (
              <Link href={hrefFor(searchParams, page + 1)} className={itemCls} aria-label="Next page">
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className={cn(itemCls, 'pointer-events-none opacity-40')} aria-hidden="true">
                <ChevronRight className="size-4" />
              </span>
            )}
          </>
        ) : null}
        <PageSizeSelect size={size} />
      </div>
    </nav>
  )
}
