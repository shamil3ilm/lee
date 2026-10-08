'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { relevanceProgressAction } from '@/app/(authed)/settings/profile/relevance-actions'

export interface RecheckStart {
  total: number
  filtered: number
  pending: boolean
}

const POLL_MS = 2_000
const MAX_POLLS = 90

/**
 * After a save: "Re-checking 734 jobs… 412 filtered out", polling the
 * queue's progress (DB counts only) until nothing is left to re-check.
 */
export function RecheckProgress({ start }: { start: RecheckStart }) {
  const [state, setState] = useState({ remaining: start.pending ? start.total : 0, filtered: start.filtered })

  useEffect(() => {
    if (!start.pending) return
    let polls = 0
    let stopped = false
    const id = setInterval(async () => {
      polls += 1
      const r = await relevanceProgressAction().catch(() => null)
      if (stopped || !r || 'error' in r) return
      setState(r)
      if (r.remaining === 0 || polls >= MAX_POLLS) clearInterval(id)
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [start])

  const busy = state.remaining > 0
  return (
    <p role="status" aria-live="polite" data-testid="recheck-progress" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {busy
        ? `Re-checking ${start.total} jobs… ${state.filtered} filtered out`
        : `Re-checked ${start.total} jobs: ${state.filtered} filtered out.`}
    </p>
  )
}
