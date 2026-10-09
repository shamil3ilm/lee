'use client'

import { useEffect } from 'react'

/**
 * Sets `data-hydrated` on <html> once React has hydrated the page, so
 * browser tests (and anything else) can wait until event handlers are
 * attached. Before hydration, input like a file chosen with setInputFiles is
 * silently dropped because React's onChange is not wired up yet.
 */
export function HydrationMarker(): null {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])
  return null
}
