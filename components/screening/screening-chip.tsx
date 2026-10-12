'use client'
import { badgeVariants, type BadgeProps } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ResponsivePopover } from '@/components/responsive-popover'
import { chipText } from '@/lib/screening/stage'
import { STAGE_LABELS, STATUS_LABELS, type ScreeningPath, type StageResult, type StageStatus } from '@/lib/screening/types'
import { cn } from '@/lib/utils'

/**
 * The first hiring stage that isn't a pass, as one chip on discovery cards
 * and rows: "At risk: notice period", "Knockout: nationals only", "ATS: 3
 * must-haves missing". Nothing when every gate stage passes. Hovering or
 * focusing it shows that stage's reasons (which keywords are missing, which
 * you can add honestly); a tap opens the same list (a sheet on phones).
 */

const VARIANT: Readonly<Record<StageStatus, BadgeProps['variant']>> = {
  fail: 'danger',
  at_risk: 'warning',
  unknown: 'neutral',
  pass: 'success',
}

/** Concerns of one stage, ATS keywords grouped by what to do about them. */
export function StageDetails({ stage }: { stage: StageResult }) {
  const concerns = stage.checks.filter((c) => c.status !== 'pass')
  const missing = stage.stage === 'ats' ? concerns.filter((c) => c.status === 'fail' || !c.action) : []
  const addable = stage.stage === 'ats' ? concerns.filter((c) => c.status !== 'fail' && c.action) : []
  const terms = (list: typeof concerns) => list.map((c) => c.short?.replace(/^add | missing$/g, '') ?? c.key).join(', ')
  return (
    <div className="space-y-1.5 text-xs" data-testid="screening-chip-details">
      <p className="font-medium">
        {STAGE_LABELS[stage.stage]}: {STATUS_LABELS[stage.status]}
      </p>
      <p className="text-muted-foreground">{stage.summary}</p>
      {stage.stage === 'ats' ? (
        <>
          {missing.length > 0 ? (
            <p>
              <span className="font-medium">Missing:</span> {terms(missing)}
            </p>
          ) : null}
          {addable.length > 0 ? (
            <p>
              <span className="font-medium">You can add honestly:</span> {terms(addable)}
            </p>
          ) : null}
        </>
      ) : concerns.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {concerns.map((c) => (
            <li key={c.key}>{c.reason}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-muted-foreground">Full screening path: open the job.</p>
    </div>
  )
}

export function ScreeningChip({ path, className }: { path: ScreeningPath | null | undefined; className?: string }) {
  const chip = path ? chipText(path) : null
  const stage = chip ? path?.stages.find((s) => s.stage === chip.stage) : undefined
  if (!chip || !stage) return null
  const badge = (
    <button
      type="button"
      data-testid="screening-chip"
      data-stage={chip.stage}
      data-status={chip.status}
      aria-label={`Screening path: ${chip.text}. Show details`}
      // Rows and cards navigate on click; the chip opens its details instead.
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        badgeVariants({ variant: VARIANT[chip.status] }),
        'min-h-6 max-w-full cursor-help truncate text-[11px] font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {chip.text}
    </button>
  )
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <ResponsivePopover
          title={`${STAGE_LABELS[stage.stage]}: ${STATUS_LABELS[stage.status]}`}
          trigger={<TooltipTrigger asChild>{badge}</TooltipTrigger>}
          onContentEvent={(e) => e.stopPropagation()}
        >
          <StageDetails stage={stage} />
        </ResponsivePopover>
        <TooltipContent
          side="bottom"
          className="max-w-xs border bg-popover p-3 text-popover-foreground"
        >
          <StageDetails stage={stage} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
