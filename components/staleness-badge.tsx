'use client'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Severity, StalenessResult } from '@/lib/staleness/types'

// v9 — compact chip for document list/table rows. One fetch per document at
// personal-use scale is fine (~10s of docs on a page). If usage grows, a
// batched `/api/documents/staleness?ids=…` would be the swap-in.

interface StalenessBadgeProps {
  documentId: string
  className?: string
  /** Rendered while loading, when the check fails and for fresh documents
   *  (so a table cell is never mysteriously blank). */
  fallback?: React.ReactNode
}

const LABEL: Record<Severity, string> = {
  fresh: 'Fresh',
  minor: 'Minor drift',
  critical: 'Stale',
}

const DOT: Record<Severity, string> = {
  fresh: 'bg-success',
  minor: 'bg-warning',
  critical: 'bg-danger',
}

const VARIANT: Record<Severity, 'success' | 'warning' | 'danger'> = {
  fresh: 'success',
  minor: 'warning',
  critical: 'danger',
}

export function StalenessBadge({ documentId, className, fallback = null }: StalenessBadgeProps) {
  const [severity, setSeverity] = useState<Severity | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    fetch(`/api/documents/${documentId}/staleness`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setSeverity((data as StalenessResult).severity)
      })
      .catch(() => {
        /* silently degrade to no badge */
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [documentId])

  if (!severity) return <>{fallback}</>
  // Suppress the "Fresh" chip to avoid visual noise — no news is good news.
  if (severity === 'fresh') return <>{fallback}</>

  return (
    <Badge
      variant={VARIANT[severity]}
      className={cn('gap-1 text-[10px]', className)}
      title={`Staleness: ${LABEL[severity]}`}
    >
      <span className={cn('size-1.5 rounded-full', DOT[severity])} aria-hidden />
      {LABEL[severity]}
    </Badge>
  )
}
