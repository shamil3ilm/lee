'use client'
import { useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pickActiveHref } from '@/lib/ui/nav-active'
import { cn } from '@/lib/utils'

export interface SettingsNavItem {
  href: string
  label: string
}

export interface SettingsNavGroup {
  label: string
  items: readonly SettingsNavItem[]
}

/**
 * Settings sections in two groups: "You" (what lee knows about you and
 * how it searches) and "System" (sources, integrations and the machinery).
 * Exported for the nav test and the sidebar's active-route matching.
 */
export const SETTINGS_GROUPS: readonly SettingsNavGroup[] = [
  {
    label: 'You',
    items: [
      { href: '/settings/profile', label: 'Profile' },
      { href: '/settings/resume', label: 'Résumé' },
      { href: '/settings/search', label: 'Search' },
      { href: '/settings/current-job', label: 'Current job' },
      { href: '/settings/variants', label: 'Variants' },
      { href: '/settings/study', label: 'Study list' },
      { href: '/settings/publish', label: 'Portfolio' },
      { href: '/settings/linkedin', label: 'LinkedIn' },
      { href: '/settings/notifications', label: 'Notifications' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings/sources', label: 'Sources' },
      { href: '/settings/integrations', label: 'Integrations' },
      { href: '/settings/ai', label: 'AI' },
      { href: '/settings/scam-shield', label: 'Scam Shield' },
      { href: '/settings/jobs', label: 'Background jobs' },
      { href: '/settings/logs', label: 'Logs' },
      { href: '/settings/usage', label: 'Usage' },
      { href: '/settings/storage', label: 'Storage' },
    ],
  },
]

const ALL_HREFS = SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.href))

const itemCls =
  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/**
 * The one Settings navigation level. From `lg` up it is a left column with
 * the two group headings; below that a single row that scrolls sideways
 * (group labels inline), so phones never get a wrapped wall of tabs.
 */
export function SettingsNav() {
  const pathname = usePathname()
  const active = pickActiveHref(pathname, ALL_HREFS)
  const rowRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const row = rowRef.current
    const el = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !el || row.scrollWidth <= row.clientWidth) return
    const rowBox = row.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    if (box.left < rowBox.left || box.right > rowBox.right) {
      row.scrollLeft = Math.max(0, box.left - rowBox.left + row.scrollLeft - (rowBox.width - box.width) / 2)
    }
  }, [active])

  return (
    <nav aria-label="Settings sections" data-testid="settings-nav" className="lg:sticky lg:top-20 lg:self-start">
      {/* Phones and tablets: one scrolling row. */}
      <div
        ref={rowRef}
        className="-mx-4 flex items-center gap-1 overflow-x-auto border-b px-4 pb-2 [scrollbar-width:none] max-md:pr-8 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] md:mx-0 md:px-0 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {SETTINGS_GROUPS.map((g, gi) => (
          <div key={g.label} role="group" aria-label={g.label} className="flex shrink-0 items-center gap-1">
            <span
              aria-hidden="true"
              className={cn(
                'px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                gi > 0 && 'ml-2 border-l pl-3',
              )}
            >
              {g.label}
            </span>
            {g.items.map((i) => (
              <NavLink key={i.href} item={i} active={i.href === active} />
            ))}
          </div>
        ))}
      </div>
      {/* Desktop: a left column. */}
      <div className="hidden space-y-5 lg:block">
        {SETTINGS_GROUPS.map((g) => (
          <div key={g.label} role="group" aria-labelledby={`settings-group-${g.label}`}>
            <p
              id={`settings-group-${g.label}`}
              className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <li key={i.href}>
                  <NavLink item={i} active={i.href === active} block />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

function NavLink({ item, active, block = false }: { item: SettingsNavItem; active: boolean; block?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        itemCls,
        block && 'block',
        active
          ? 'bg-secondary font-medium text-secondary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {item.label}
    </Link>
  )
}
