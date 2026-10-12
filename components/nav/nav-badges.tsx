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

/** Accessible wording per count: "6 pending", "2 need a look". */
const COUNT_LABEL: Partial<Record<NavBadgeKey, (n: number) => string>> = {
  needsLook: (n) => `${n} ${n === 1 ? 'needs' : 'need'} a look`,
}

function BadgePill({ badgeKey, tone }: { badgeKey: NavBadgeKey; tone: 'primary' | 'quiet' }) {
  const count = useBadgeCount(badgeKey)
  if (count <= 0) return null
  const label = COUNT_LABEL[badgeKey]?.(count) ?? `${count} pending`
  return (
    <>
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums',
          tone === 'primary' ? 'ml-auto bg-primary text-primary-foreground' : 'border border-warning/40 bg-warning-soft text-warning',
          RAIL_HIDDEN,
        )}
        aria-label={label}
        title={label}
      >
        {count > 99 ? '99+' : count}
      </span>
      {tone === 'primary' ? (
        <span
          aria-hidden
          className="absolute right-2 top-1 hidden size-1.5 rounded-full bg-primary group-data-[sidebar=rail]/shell:block"
        />
      ) : null}
    </>
  )
}

/**
 * The count pill (and rail dot) for a nav link; renders nothing until known.
 * `quiet` is a second, amber count beside the first (Discovery's "Needs a
 * look"), never merged into it.
 */
export function NavBadge({ badgeKey, tone = 'primary' }: { badgeKey: NavBadgeKey; tone?: 'primary' | 'quiet' }) {
  return (
    <Suspense fallback={null}>
      <BadgePill badgeKey={badgeKey} tone={tone} />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// Settings › Labs: whether the side-project nav group shows. Streams like the
// badge counts, so the shell never waits for it.
// ---------------------------------------------------------------------------

const NavLabsContext = createContext<Promise<boolean> | null>(null)

export function NavLabsProvider({ labs, children }: { labs: Promise<boolean>; children: ReactNode }) {
  return <NavLabsContext value={labs}>{children}</NavLabsContext>
}

function LabsOnly({ children }: { children: ReactNode }) {
  const promise = use(NavLabsContext)
  // No provider (a component rendered in isolation): show everything.
  const on = promise ? use(promise) : true
  return on ? children : null
}

/** Renders its children only with Labs on (nothing while that is unknown). */
export function LabsGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LabsOnly>{children}</LabsOnly>
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
