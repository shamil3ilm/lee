import { AlertTriangle, CheckCircle2, CircleHelp, TrendingUp, XCircle } from 'lucide-react'
import { byConcern } from '@/lib/screening/stage'
import { STAGE_LABELS, STATUS_LABELS, type ScreeningPath, type StageResult, type StageStatus } from '@/lib/screening/types'
import { cn } from '@/lib/utils'

/**
 * "Screening path" block (in "Why this score" and on the discovery page):
 * one line per hiring stage — eligibility, ATS keywords, recruiter, hiring
 * manager, odds — with its status, a summary and its concerns, then the
 * "Next" actions. Static content (no controls), so it adds no tap targets.
 * Explain-only: it never changes the Fit number above it.
 */

const ICON: Readonly<Record<StageStatus, typeof CheckCircle2>> = {
  pass: CheckCircle2,
  at_risk: AlertTriangle,
  fail: XCircle,
  unknown: CircleHelp,
}

const TONE: Readonly<Record<StageStatus, string>> = {
  pass: 'text-success',
  at_risk: 'text-warning',
  fail: 'text-danger',
  unknown: 'text-muted-foreground',
}

const MAX_CONCERNS = 3

function StageRow({ s }: { s: StageResult }) {
  const Icon = s.stage === 'odds' ? TrendingUp : ICON[s.status]
  // A concern the summary already says is not repeated below it.
  const concerns = byConcern(s.checks.filter((c) => c.status !== 'pass' && !s.summary.includes(c.reason))).slice(0, MAX_CONCERNS)
  return (
    <li className="flex gap-2 py-1" data-stage={s.stage} data-status={s.status}>
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', s.stage === 'odds' ? 'text-muted-foreground' : TONE[s.status])} aria-hidden="true" />
      <div className="min-w-0 text-xs leading-snug">
        <p>
          <span className="font-medium">{STAGE_LABELS[s.stage]}</span>
          <span className={cn('ml-1.5', s.stage === 'odds' ? 'text-muted-foreground' : TONE[s.status])}>
            {s.stage === 'odds' ? 'shown, not in Fit' : STATUS_LABELS[s.status]}
          </span>
        </p>
        <p className="break-words text-muted-foreground">{s.summary}</p>
        {concerns.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5" aria-label={`${STAGE_LABELS[s.stage]} concerns`}>
            {concerns.map((c) => (
              <li key={c.key} className="break-words pl-2">
                <span className={cn('font-medium', TONE[c.status])}>{STATUS_LABELS[c.status]}:</span> {c.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

export function ScreeningPathBlock({ path, className }: { path: ScreeningPath | null | undefined; className?: string }) {
  if (!path) return null
  return (
    <section className={cn('rounded-md border px-2.5 py-1.5', className)} data-testid="screening-path" aria-label="Screening path">
      <p className="text-xs font-semibold">
        Screening path
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">Would you get through each hiring stage? Explains the score; doesn’t change it.</p>
      <ol className="mt-1 divide-y" aria-label="Screening stages">
        {path.stages.map((s) => (
          <StageRow key={s.stage} s={s} />
        ))}
      </ol>
      {path.next.length > 0 ? (
        <div className="mt-1 border-t pt-1.5">
          <p className="text-xs font-medium">Next</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs leading-snug" aria-label="Next steps" data-testid="screening-next">
            {path.next.map((a) => (
              <li key={a.label} className="break-words">
                {a.label}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
