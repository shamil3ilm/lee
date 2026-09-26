import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_BORDER, TONE_SOFT } from '@/lib/ui/tones'
import { usageWarningsForUser } from '@/lib/usage/alerts'
import { logger } from '@/lib/logger'
import { formatPercent } from '@/lib/usage/format'

/**
 * Free-tier warning on Home: shown when any meter in the latest snapshot
 * (this month) is at 70 % or more. One indexed read; renders nothing
 * otherwise, and nothing on a read error.
 */
export async function UsageBanner({ userId }: { userId: string }) {
  let warnings: Awaited<ReturnType<typeof usageWarningsForUser>> = []
  try {
    warnings = await usageWarningsForUser(userId)
  } catch (err) {
    logger.warn('usage_banner_failed', { err: err instanceof Error ? err.message : String(err) })
  }
  if (warnings.length === 0) return null
  const critical = warnings.some((w) => w.threshold === 90)
  const tone = critical ? 'danger' : 'warning'
  return (
    <div
      role="status"
      data-testid="usage-banner"
      className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', TONE_SOFT[tone], TONE_BORDER[tone])}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {critical ? 'A free-tier limit is almost used up' : 'Free-tier usage is getting high'}
        </p>
        <p className="text-xs">
          {warnings.map((w) => `${w.label} ${formatPercent(w.fraction)} (${w.detail})`).join(' · ')}
          .{' '}
          <Link href="/settings/usage" className="font-medium underline underline-offset-2">
            See usage
          </Link>
        </p>
      </div>
    </div>
  )
}
