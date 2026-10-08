'use client'
import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { MAIN_CONTENT_ID } from '@/components/skip-link'
import { cn } from '@/lib/utils'

/** armed: a link was clicked, the bar is not shown yet; loading: shown. */
type Phase = 'idle' | 'armed' | 'loading' | 'done'

/** A stuck bar (a click whose navigation was cancelled) clears after this. */
const SAFETY_MS = 15_000
/** Navigations faster than this never show the bar (no flash). */
const SHOW_AFTER_MS = 120

/**
 * True for a plain left click on a same-origin link to a different URL,
 * i.e. a click that starts a client navigation. Exported for tests.
 */
export function startsNavigation(
  event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  anchor: Pick<HTMLAnchorElement, 'href' | 'target' | 'hasAttribute'> | null,
  current: Pick<Location, 'origin' | 'pathname' | 'search'>,
): boolean {
  if (!anchor || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return false
  let url: URL
  try {
    url = new URL(anchor.href, `${current.origin}${current.pathname}`)
  } catch {
    return false
  }
  if (url.origin !== current.origin) return false
  // Same page (or only a #hash change): nothing will load.
  return !(url.pathname === current.pathname && url.search === current.search)
}

/**
 * The shell's pending-navigation signal (audit F26): a 2px bar at the top of
 * the viewport from the click on a link until the new URL commits, plus
 * `aria-busy` on <main>. It shows only when the route takes longer than
 * ~120ms, so prefetched navigations stay instant. Route skeletons
 * (loading.tsx) take over once the server starts streaming.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams()
  const [phase, setPhase] = React.useState<Phase>('idle')

  // The URL changed: the navigation committed.
  const url = `${pathname}?${search?.toString() ?? ''}`
  const [lastUrl, setLastUrl] = React.useState(url)
  if (url !== lastUrl) {
    setLastUrl(url)
    // Committed before the bar showed: nothing to animate.
    if (phase === 'armed') setPhase('idle')
    else if (phase === 'loading') setPhase('done')
  }

  React.useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const anchor = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!startsNavigation(e, anchor, window.location)) return
      setPhase('armed')
    }
    // Capture phase: next/link calls preventDefault() on the bubble.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  React.useEffect(() => {
    const main = document.getElementById(MAIN_CONTENT_ID)
    if (phase === 'armed' || phase === 'loading') main?.setAttribute('aria-busy', 'true')
    else main?.removeAttribute('aria-busy')
    if (phase === 'idle') return
    const t =
      phase === 'armed'
        ? window.setTimeout(() => setPhase((p) => (p === 'armed' ? 'loading' : p)), SHOW_AFTER_MS)
        : window.setTimeout(() => setPhase('idle'), phase === 'done' ? 400 : SAFETY_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        data-phase={phase}
        className={cn(
          'h-full origin-left bg-primary',
          (phase === 'idle' || phase === 'armed') && 'scale-x-0 opacity-0',
          phase === 'loading' && 'lee-nav-progress',
          phase === 'done' && 'lee-nav-progress-done',
        )}
      />
    </div>
  )
}
