'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StalenessResult } from '@/lib/staleness/types'

// v9 — inline "this draft is stale" banner. Mounted above the copy/download
// surface of an AI-generated document. Fetches the check result once on
// mount, then renders:
//   - fresh   → nothing
//   - minor   → yellow "regenerate encouraged"
//   - critical → red "regenerate before consuming" + copy-anyway audit
//
// Kept as small as possible so component tree stays cheap — the parent
// decides where to place it and what to do on Regenerate.

interface StalenessBannerProps {
  documentId: string
  /** Called when the user clicks Regenerate. Parent triggers the appropriate POST. */
  onRegenerate?: () => void | Promise<void>
  /** Called when the user chooses "Copy anyway" — parent is responsible for the actual copy. */
  onCopyAnyway?: () => void | Promise<void>
  className?: string
}

const DISMISS_KEY_PREFIX = 'employ:staleness-dismissed:'

function isDismissed(documentId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + documentId) === '1'
  } catch {
    return false
  }
}

function setDismissed(documentId: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + documentId, '1')
  } catch {
    /* private-mode / disabled storage → no-op */
  }
}

export function StalenessBanner({
  documentId,
  onRegenerate,
  onCopyAnyway,
  className,
}: StalenessBannerProps) {
  const [result, setResult] = useState<StalenessResult | null>(null)
  const [dismissed, setDismissedState] = useState<boolean>(false)
  const [busy, setBusy] = useState<'regen' | 'copy' | null>(null)

  useEffect(() => {
    setDismissedState(isDismissed(documentId))
    let cancelled = false
    const controller = new AbortController()
    fetch(`/api/documents/${documentId}/staleness`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setResult(data as StalenessResult)
      })
      .catch(() => {
        /* network hiccup — silently degrade to no banner */
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [documentId])

  const handleDismiss = useCallback(() => {
    setDismissed(documentId)
    setDismissedState(true)
  }, [documentId])

  const handleRegenerate = useCallback(async () => {
    if (!onRegenerate) return
    setBusy('regen')
    try {
      await onRegenerate()
    } finally {
      setBusy(null)
    }
  }, [onRegenerate])

  const handleCopyAnyway = useCallback(async () => {
    setBusy('copy')
    try {
      // Fire and forget — audit log failure should not block the copy.
      void fetch(`/api/documents/${documentId}/acknowledge-stale`, { method: 'POST' })
      if (onCopyAnyway) await onCopyAnyway()
      handleDismiss()
    } finally {
      setBusy(null)
    }
  }, [documentId, handleDismiss, onCopyAnyway])

  if (!result) return null
  if (dismissed) return null
  if (result.severity === 'fresh') return null

  const isCritical = result.severity === 'critical'

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        isCritical
          ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100'
          : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          'mt-0.5 size-4 shrink-0',
          isCritical ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {isCritical ? 'Stale draft' : 'Minor drift since generated'}
        </p>
        <p className="mt-0.5 text-xs opacity-90">{result.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onRegenerate ? (
            <Button
              type="button"
              size="sm"
              variant={isCritical ? 'default' : 'secondary'}
              onClick={() => {
                void handleRegenerate()
              }}
              disabled={busy !== null}
            >
              {busy === 'regen' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Regenerate
            </Button>
          ) : null}
          {isCritical ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                void handleCopyAnyway()
              }}
              disabled={busy !== null}
            >
              {busy === 'copy' ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Copy anyway
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={handleDismiss}>
            <X className="size-3.5" />
            Dismiss warning
          </Button>
        </div>
      </div>
    </div>
  )
}
