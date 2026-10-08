'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Clock, ExternalLink, FileText, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { focusRing } from '@/components/ui/focus-ring'
import { ShortlistReasons } from '@/components/apply/shortlist-reasons'
import { VsCurrentChip } from '@/components/compare/vs-current-chip'
import { MatchBadge } from '@/components/discovery/match-badge'
import type { MatchDetail } from '@/lib/discovery/match/types'
import { laterAction, notForMeAction, prepareAction } from '@/app/(authed)/shortlist/actions'
import { DISMISS_REASONS, DISMISS_REASON_LABELS } from '@/lib/apply/feedback'
import type { RankReason } from '@/lib/apply/rank'
import { joinMeta } from '@/lib/ui/meta'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

export interface ShortlistCardItem {
  discoveryId: string
  rank: number
  score: number
  title: string
  companyName: string
  location: string | null
  applyUrl: string | null
  reasons: RankReason[]
  variantName: string | null
  /** Compact comparison with the current job, when one is saved. */
  vsCurrent?: string | null
  matchScore?: number | null
  fitScore?: number | null
  fitDetail?: MatchDetail | null
}

interface ShortlistCardProps {
  item: ShortlistCardItem
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  /** A batch is running: every card's actions wait. */
  busy?: boolean
}

export function ShortlistCard({ item, selected, onSelectedChange, busy = false }: ShortlistCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const disabled = pending || busy
  const checkboxId = `shortlist-select-${item.discoveryId}`

  const prepare = (): void =>
    startTransition(async () => {
      const r = await prepareAction(item.discoveryId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      router.push(`/applications/${r.applicationId}/prepare`)
    })

  const runLater = (): void =>
    startTransition(async () => {
      const r = await laterAction(item.discoveryId)
      if ('error' in r) toast.error(r.error)
      else toast.success('Moved to later. It stays on Discovery › Shortlisted.')
      router.refresh()
    })

  const dismiss = (reason: string): void =>
    startTransition(async () => {
      const r = await notForMeAction(item.discoveryId, reason)
      if ('error' in r) toast.error(r.error)
      else toast.success('Got it. Similar roles will rank lower.')
      router.refresh()
    })

  return (
    <li
      className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
      data-testid="shortlist-card"
      aria-busy={pending || undefined}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <Checkbox
          id={checkboxId}
          className="mt-1"
          checked={selected}
          disabled={disabled}
          onChange={(e) => onSelectedChange(e.target.checked)}
          aria-label={`Select ${item.title} for batch prepare`}
        />
        <div className="min-w-0 space-y-1">
          <label htmlFor={checkboxId} className="block cursor-pointer text-sm font-semibold leading-snug">
            <span className="mr-1.5 text-muted-foreground tabular-nums">#{item.rank}</span>
            {item.title}
          </label>
          <p className="truncate text-xs text-muted-foreground">{joinMeta([item.companyName, item.location])}</p>
        </div>
        <MatchBadge
          match={item.fitScore ?? null}
          ai={item.matchScore ?? null}
          detail={item.fitDetail ?? null}
          extra={<ShortlistReasons rank={item.rank} score={item.score} reasons={item.reasons} />}
        />
      </div>

      {item.vsCurrent ? <VsCurrentChip text={item.vsCurrent} href={`/discoveries/${item.discoveryId}`} className="mt-2" /> : null}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        {item.variantName ? (
          <span className="min-w-0 truncate">
            Suggested résumé: <span className="font-medium text-foreground">{item.variantName}</span>
          </span>
        ) : (
          <span>No matching résumé variant yet; the master profile is used.</span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={prepare} disabled={disabled}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Prepare application
        </Button>
        <Button size="sm" variant="outline" onClick={runLater} disabled={disabled}>
          <Clock className="size-4" />
          Later
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={disabled}>
              Not for me
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">Why not?</DropdownMenuLabel>
            {DISMISS_REASONS.map((reason) => (
              <DropdownMenuItem key={reason} onSelect={() => dismiss(reason)}>
                {DISMISS_REASON_LABELS[reason]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {item.applyUrl ? (
          <a
            href={item.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('ml-auto inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground', focusRing)}
          >
            Posting
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </li>
  )
}
