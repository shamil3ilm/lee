'use client'
import { useLayoutEffect, useRef } from 'react'
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
 * On narrow screens the bar scrolls horizontally instead of wrapping: it
 * bleeds to the screen edge (so tabs line up with the page gutter), fades at
 * the right edge as a scroll cue, and keeps the active tab scrolled into view.
 */
export function RouteTabs({ tabs, label, hideOnSubroutes = false, className }: RouteTabsProps) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const hrefs = tabs.map((t) => t.href)
  const hidden = hideOnSubroutes && !hrefs.includes(pathname)
  const active = pickActiveHref(pathname, hrefs)

  useLayoutEffect(() => {
    const nav = navRef.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el) return
    // Horizontal only: scrollIntoView would also move the page vertically.
    const navBox = nav.getBoundingClientRect()
    const tabBox = el.getBoundingClientRect()
    if (tabBox.left < navBox.left || tabBox.right > navBox.right) {
      const tabLeft = tabBox.left - navBox.left + nav.scrollLeft
      nav.scrollLeft = Math.max(0, tabLeft - (navBox.width - tabBox.width) / 2)
    }
  }, [active])

  if (hidden) return null
  return (
    <nav
      ref={navRef}
      aria-label={label}
      className={cn(
        '-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden',
        // Right-edge fade on phones hints that more tabs sit off-screen.
        'max-md:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]',
        className,
      )}
    >
      <div className="flex min-w-max items-center gap-1 border-b max-md:pr-8">
        {tabs.map((tab) => {
          const isActive = tab.href === active
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
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
