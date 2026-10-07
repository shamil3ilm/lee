import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { RankReason } from '@/lib/apply/rank'
import { cn } from '@/lib/utils'

/**
 * The shortlist's "why": one chip per part of the composite score, with the
 * points it added or took away (so the meaning never rests on colour alone).
 */

function tone(r: RankReason): BadgeProps['variant'] {
  if (r.kind === 'match') return 'info'
  if (r.points > 0) return 'success'
  if (r.kind === 'risk' || r.points <= -10) return 'danger'
  if (r.points < 0) return 'warning'
  return 'neutral'
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

export function ReasonChips({ reasons, max = 6, className }: { reasons: readonly RankReason[]; max?: number; className?: string }) {
  const shown = reasons.slice(0, max)
  const hidden = reasons.length - shown.length
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Why it ranks here">
      {shown.map((r, i) => (
        <li key={`${r.kind}-${i}`}>
          <Badge variant={tone(r)} className="max-w-[16rem] gap-1 whitespace-normal text-[11px] font-medium">
            <span className="truncate">{r.label}</span>
            {r.kind === 'match' ? null : <span className="tabular-nums opacity-80">{signed(r.points)}</span>}
          </Badge>
        </li>
      ))}
      {hidden > 0 ? (
        <li>
          <Badge variant="outline" className="text-[11px]">
            +{hidden} more
          </Badge>
        </li>
      ) : null}
    </ul>
  )
}
