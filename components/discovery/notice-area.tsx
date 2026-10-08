'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export interface PageNoticeItem {
  /** Stable key, e.g. "defaults", "recheck", "filter-review", "looking-for". */
  id: string
  node: React.ReactNode
}

interface NoticeAreaProps {
  /** Highest priority first; only the first one shows until "+N more". */
  notices: readonly PageNoticeItem[]
}

/**
 * One notice slot above a list (audit S1): the highest-priority notice is
 * shown, the rest wait behind a "+N more" toggle, so the first result is on
 * screen at every width and nothing is lost.
 */
export function NoticeArea({ notices }: NoticeAreaProps) {
  const [all, setAll] = useState(false)
  const [first, ...rest] = notices
  if (!first) return null
  return (
    <div className="space-y-2" data-testid="notice-area" data-notice={first.id}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{first.node}</div>
        {rest.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 shrink-0 px-2 text-xs"
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
          >
            {all ? 'Show less' : `+${rest.length} more`}
          </Button>
        ) : null}
      </div>
      {all
        ? rest.map((n) => (
            <div key={n.id} data-notice={n.id}>
              {n.node}
            </div>
          ))
        : null}
    </div>
  )
}
