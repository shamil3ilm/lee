import { Fragment } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  /** Omit for non-link crumbs (journey stage labels, the current page). */
  href?: string
}

interface BreadcrumbsProps {
  items: Crumb[]
  className?: string
}

/**
 * Journey-aware breadcrumb trail, e.g. Apply › Applications › Stripe — Senior BE.
 * The last crumb is the current page and is never a link.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 ? (
                <li aria-hidden>
                  <ChevronRight className="size-3" />
                </li>
              ) : null}
              <li className={cn('min-w-0', isLast && 'truncate font-medium text-foreground')}>
                {item.href && !isLast ? (
                  <Link href={item.href} className="hover:text-foreground hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
