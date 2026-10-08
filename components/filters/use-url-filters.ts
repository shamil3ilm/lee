'use client'
import { useCallback, useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { mergeQuery, withQuery } from '@/lib/ui/filter-query'

export const FILTER_DEBOUNCE_MS = 300

export interface ApplyOptions {
  /** Wait for typing to pause (text and search inputs). */
  debounce?: boolean
}

/**
 * URL-driven filters that apply on change. The query string is the state:
 * `setParams` merges a patch into the current URL (resetting `page`) and
 * `router.replace`s it in a transition, so the server page re-renders with
 * the new results and Back doesn't step through every keystroke.
 *
 *   const { searchParams, setParams, pending } = useUrlFilters()
 *   <NativeSelect value={searchParams.get('sort') ?? 'combined'}
 *     onChange={(e) => setParams({ sort: e.target.value })} />
 *   <Input onChange={(e) => setParams({ q: e.target.value }, { debounce: true })} />
 */
export function useUrlFilters({ debounceMs = FILTER_DEBOUNCE_MS }: { debounceMs?: number } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  /** Navigate to the href `build()` returns, now or after the debounce; no-op when unchanged. */
  const navigate = useCallback(
    (build: () => string, { debounce = false }: ApplyOptions = {}): void => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const run = (): void => {
        timer.current = null
        const href = build()
        if (href === `${window.location.pathname}${window.location.search}`) return
        startTransition(() => router.replace(href, { scroll: false }))
      }
      if (debounce) timer.current = setTimeout(run, debounceMs)
      else run()
    },
    [router, debounceMs],
  )

  const setParams = useCallback(
    (patch: Readonly<Record<string, string | null | undefined>>, options?: ApplyOptions): void => {
      // Read the live URL when the change runs, so a debounced edit never
      // overwrites a select changed in the meantime.
      navigate(() => withQuery(pathname, mergeQuery(window.location.search, patch)), options)
    },
    [navigate, pathname],
  )

  return { searchParams, setParams, navigate, pending }
}
