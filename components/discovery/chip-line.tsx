import { ReasonChip } from '@/components/discovery/reason-chip'
import { ScreeningChip } from '@/components/screening/screening-chip'
import { reasonChip, screeningRepeats, type ReasonInput } from '@/lib/ui/reason-chip'
import { chipText } from '@/lib/screening/stage'
import type { ScreeningPath } from '@/lib/screening/types'

interface ChipLineProps {
  reason: ReasonInput | null
  screen?: ScreeningPath | null
  /** Smaller chips on board cards. */
  compact?: boolean
}

/**
 * The one compact chip line on job cards and rows: the reason (filtered,
 * Needs a look, Fit ceiling, ranked lower) first, then the screening stage.
 * When the screening chip only repeats the reason ("Not a tech role" and
 * "Recruiter: not a tech role") the line shows the reason alone.
 */
export function ChipLine({ reason, screen, compact = false }: ChipLineProps) {
  const r = reason ? reasonChip(reason) : null
  const s = screen ? chipText(screen) : null
  const showScreen = s !== null && !screeningRepeats(r?.label, s.text)
  if (!r && !showScreen) return null
  const size = compact ? 'text-[10px]' : undefined
  return (
    <>
      {reason && r ? <ReasonChip {...reason} className={size} /> : null}
      {showScreen ? <ScreeningChip path={screen} className={size} /> : null}
    </>
  )
}
