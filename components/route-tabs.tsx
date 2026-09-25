'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pickActiveHref } from '@/lib/ui/nav-active'
import { cn } from '@/lib/utils'

export interface RouteTab {
  href: string
  label: string
}

interface RouteTabsProps {
  tabs: RouteTab[]
  label: string
  /** Hide the bar on routes that aren't exactly a tab target (e.g. edit pages). */
  hideOnSubroutes?: boolean
  className?: string
}

/**
 * Link-based tab bar for sibling routes. Active tab = longest matching href.
 * Scrolls horizontally on narrow screens instead of wrapping.
 */
export function RouteTabs({ tabs, label, hideOnSubroutes = false, className }: RouteTabsProps) {
  const pathname = usePathname()
  const hrefs = tabs.map((t) => t.href)
  if (hideOnSubroutes && !hrefs.includes(pathname)) return null
  const active = pickActiveHref(pathname, hrefs)
  return (
    <nav aria-label={label} className={cn('-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0', className)}>
      <div className="inline-flex min-w-max items-center gap-1 border-b">
        {tabs.map((tab) => {
          const isActive = tab.href === active
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
