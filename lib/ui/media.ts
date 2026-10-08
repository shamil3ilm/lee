'use client'
import { useSyncExternalStore } from 'react'

/**
 * `useMediaQuery('(max-width: 639px)')`: true while the query matches.
 * The server snapshot is `false` (desktop first), so callers must render a
 * layout that is also correct on phones before hydration (CSS breakpoints),
 * and use this only for behaviour that needs JS (popover vs bottom sheet).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

/** Below Tailwind's `sm` (640px): phones. */
export const PHONE_QUERY = '(max-width: 639px)'
/** Below Tailwind's `md` (768px). */
export const BELOW_MD_QUERY = '(max-width: 767px)'
