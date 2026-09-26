'use client'
import { createContext, Suspense, use, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { NavBadgeKey, NavBadges } from './nav-config'

/**
 * Nav badge counts arrive as a promise so the app shell never waits on the
 * database: the authed layout starts the count queries, hands the unresolved
 * promise down, and paints the sidebar at once. Each badge is its own tiny
 * Suspense boundary that fills in when the counts stream in. A badge sits at
 * the end of a fixed-height row, so it appearing shifts nothing.
 */
const NavBadgesContext = createContext<Promise<NavBadges> | null>(null)

interface NavBadgesProviderProps {
  badges: Promise<NavBadges>
  children: ReactNode
}

export function NavBadgesProvider({ badges, children }: NavBadgesProviderProps) {
  return <NavBadgesContext value={badges}>{children}</NavBadgesContext>
}

function useBadgeCount(badgeKey: NavBadgeKey): number {
  const promise = use(NavBadgesContext)
  // No provider (e.g. a component rendered in isolation): no badges.
  if (!promise) return 0
  return use(promise)[badgeKey] ?? 0
}

// Hidden when the desktop shell is in rail mode. The mobile Sheet renders in
// a portal outside the shell, so these variants never apply there.
const RAIL_HIDDEN = 'group-data-[sidebar=rail]/shell:hidden'

function BadgePill({ badgeKey }: { badgeKey: NavBadgeKey }) {
  const count = useBadgeCount(badgeKey)
  if (count <= 0) return null
  return (
    <>
      <span
        className={cn(
          'ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums',
          RAIL_HIDDEN,
        )}
        aria-label={`${count} pending`}
      >
        {count > 99 ? '99+' : count}
      </span>
      <span
        aria-hidden
        className="absolute right-2 top-1 hidden size-1.5 rounded-full bg-primary group-data-[sidebar=rail]/shell:block"
      />
    </>
  )
}

/** The count pill (and rail dot) for a nav link; renders nothing until known. */
export function NavBadge({ badgeKey }: { badgeKey: NavBadgeKey }) {
  return (
    <Suspense fallback={null}>
      <BadgePill badgeKey={badgeKey} />
    </Suspense>
  )
}

function CountSuffix({ badgeKey }: { badgeKey: NavBadgeKey }) {
  const count = useBadgeCount(badgeKey)
  return count > 0 ? ` (${count})` : null
}

/** " (3)" after a rail tooltip label once the count is known. */
export function NavBadgeSuffix({ badgeKey }: { badgeKey: NavBadgeKey }) {
  return (
    <Suspense fallback={null}>
      <CountSuffix badgeKey={badgeKey} />
    </Suspense>
  )
}
