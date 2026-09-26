'use client'
import { useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AiUsage } from '@/lib/ai/usage-types'
import { formatUsageDetails, formatUsageLine } from '@/lib/ai/usage-format'

interface UsageBadgeProps {
  usage: AiUsage | null | undefined
  className?: string
}

/**
 * Compact per-response AI usage line — "1,240 in · 310 out · gpt-oss-20b ·
 * 1.2 s" — with provider, retries and the $0 free-tier note in a tooltip.
 * Renders nothing when there is no usage (e.g. an older document).
 */
export function UsageBadge({ usage, className }: UsageBadgeProps) {
  if (!usage) return null
  const line = formatUsageLine(usage)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              'inline-flex max-w-full items-center gap-1 truncate rounded text-[10px] tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
            aria-label={`AI usage: ${line}`}
          >
            <Cpu className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{line}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] space-y-0.5 text-xs">
          {formatUsageDetails(usage).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface CallUsageBadgeProps {
  callId: string | null | undefined
  className?: string
}

/**
 * Usage for an AI result produced earlier (e.g. discovery scoring in the
 * cron). Fetches the one ai_call_logs row on mount, so mount it only where
 * the result is actually shown (an expanded row), keeping list queries lean.
 */
export function CallUsageBadge({ callId, className }: CallUsageBadgeProps) {
  const [usage, setUsage] = useState<AiUsage | null>(null)
  useEffect(() => {
    if (!callId) return
    const ctrl = new AbortController()
    fetch(`/api/ai-calls/${callId}/usage`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ usage?: AiUsage | null }>) : null))
      .then((j) => setUsage(j?.usage ?? null))
      .catch(() => {
        /* usage is decorative — stay silent */
      })
    return () => ctrl.abort()
  }, [callId])
  return <UsageBadge usage={usage} className={className} />
}
