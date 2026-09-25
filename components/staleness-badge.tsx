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
}

const LABEL: Record<Severity, string> = {
  fresh: 'Fresh',
  minor: 'Minor drift',
  critical: 'Stale',
}

const DOT: Record<Severity, string> = {
  fresh: 'bg-emerald-500',
  minor: 'bg-amber-500',
  critical: 'bg-rose-500',
}

const VARIANT: Record<Severity, 'emerald' | 'slate' | 'rose'> = {
  fresh: 'emerald',
  minor: 'slate',
  critical: 'rose',
}

export function StalenessBadge({ documentId, className }: StalenessBadgeProps) {
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

  if (!severity) return null
  // Suppress the "Fresh" chip to avoid visual noise — no news is good news.
  if (severity === 'fresh') return null

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
