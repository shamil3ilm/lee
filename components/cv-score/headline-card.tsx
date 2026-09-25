'use client'
import { useState } from 'react'
import { ChevronDown, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CvFinding, HeadlineScore } from '@/lib/cv-score/types'
import { scoreTone, SEVERITY_BADGE } from './client'
import { ScoreBar } from './score-ring'

interface HeadlineCardProps {
  score: HeadlineScore
  findings: CvFinding[]
  jdOnly: boolean
  onFilter: () => void
}

export function HeadlineCard({ score, findings, jdOnly, onFilter }: HeadlineCardProps) {
  const [open, setOpen] = useState(false)
  const tone = scoreTone(score.score)
  const pickJob = jdOnly && score.skipped && score.reason === 'Pick a job to see match'

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{score.label}</p>
            {score.weight > 0 ? (
              <p className="text-[11px] text-muted-foreground">{Math.round(score.weight * 100)}% of total</p>
            ) : null}
          </div>
          {pickJob ? (
            <Badge variant="neutral" className="shrink-0 gap-1">
              <Link2 className="size-3" /> Pick a job
            </Badge>
          ) : (
            <div className="flex shrink-0 items-baseline gap-1.5">
              <span className={cn('text-2xl font-semibold tabular-nums', tone.text)}>{score.score ?? '—'}</span>
              {score.grade ? <span className="text-xs text-muted-foreground">{score.grade}</span> : null}
            </div>
          )}
        </div>
        {pickJob ? (
          <p className="text-xs text-muted-foreground">Select a target application to see how well this CV fits it.</p>
        ) : (
          <>
            <ScoreBar score={score.score} />
            <p className="text-xs text-muted-foreground">{score.verdict}</p>
            {score.reason && !score.skipped ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{score.reason}</p>
            ) : null}
          </>
        )}
        {!pickJob ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-auto flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            {open ? 'Hide' : 'Details'}
            {findings.length ? ` · ${findings.length} finding${findings.length > 1 ? 's' : ''}` : ''}
          </button>
        ) : null}
        {open && !pickJob ? (
          <div className="space-y-3 border-t pt-2">
            {score.breakdown.length ? (
              <ul className="space-y-1.5">
                {score.breakdown.map((b) => (
                  <li key={b.key} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="tabular-nums">
                        {b.score ?? 'skipped'}
                        {b.score !== null && score.breakdown.length > 1 ? (
                          <span className="text-muted-foreground"> · {Math.round(b.weight * 100)}%</span>
                        ) : null}
                      </span>
                    </div>
                    {b.note ? <p className="text-[11px] text-muted-foreground">{b.note}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {findings.length ? (
              <ul className="space-y-1">
                {findings.slice(0, 4).map((f) => (
                  <li key={f.id} className="flex gap-1.5 text-xs">
                    <Badge variant={SEVERITY_BADGE[f.severity]} className="h-fit px-1 py-0 text-[10px]">
                      {f.severity}
                    </Badge>
                    <span>{f.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No findings for this score.</p>
            )}
            {findings.length ? (
              <button type="button" onClick={onFilter} className="text-xs font-medium text-primary hover:underline">
                Show these in the findings list
              </button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
