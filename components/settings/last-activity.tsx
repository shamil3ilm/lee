import Link from 'next/link'
import type { EventLevel } from '@/lib/logs/types'
import { DISPLAY_LOCALE, relativeFromNow } from '@/lib/ui/date'
import { TONE_TEXT } from '@/lib/ui/tones'
import { EVENT_LEVEL_TONE } from '@/lib/ui/run-status'

/** Serializable: passed from the Integrations page to client cards. */
export interface LastActivityItem {
  /** ISO timestamp. */
  at: string
  message: string
  level: EventLevel
}

/** "Last activity 2h ago: 40 checked · 2 matched · Log" */
export function LastActivity({
  item,
  logsHref,
  testId,
}: {
  item: LastActivityItem | null
  logsHref: string
  testId?: string
}) {
  if (!item) return null
  return (
    <div className="text-xs text-muted-foreground" data-testid={testId}>
      Last activity{' '}
      <span title={new Date(item.at).toLocaleString(DISPLAY_LOCALE)} suppressHydrationWarning>
        {relativeFromNow(item.at)}
      </span>
      :{' '}
      <span className={item.level === 'info' ? 'text-foreground' : TONE_TEXT[EVENT_LEVEL_TONE[item.level]]}>
        {item.message}
      </span>{' '}
      ·{' '}
      <Link href={logsHref} className="underline-offset-2 hover:underline">
        Log
      </Link>
    </div>
  )
}
