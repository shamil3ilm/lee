import { badgeVariants, type BadgeProps } from '@/components/ui/badge'
import { chipText } from '@/lib/screening/stage'
import type { ScreeningPath, StageStatus } from '@/lib/screening/types'
import { cn } from '@/lib/utils'

/**
 * The first hiring stage that isn't a pass, as one chip on discovery cards
 * and rows: "At risk: notice period", "Knockout: nationals only", "ATS: 3
 * must-haves missing". Nothing when every gate stage passes. Not
 * interactive (the reasons live in "Why this score").
 */

const VARIANT: Readonly<Record<StageStatus, BadgeProps['variant']>> = {
  fail: 'danger',
  at_risk: 'warning',
  unknown: 'neutral',
  pass: 'success',
}

export function ScreeningChip({ path, className }: { path: ScreeningPath | null | undefined; className?: string }) {
  const chip = path ? chipText(path) : null
  if (!chip) return null
  return (
    <span
      data-testid="screening-chip"
      data-stage={chip.stage}
      data-status={chip.status}
      className={cn(badgeVariants({ variant: VARIANT[chip.status] }), 'max-w-full truncate text-[11px] font-normal', className)}
      title={`Screening path: ${chip.text}`}
    >
      <span className="sr-only">Screening path: </span>
      {chip.text}
    </span>
  )
}
