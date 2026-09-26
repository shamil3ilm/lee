'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gauge, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CV_FIT_TARGET, type CvFitView } from '@/lib/cv-score/fit'
import { cn } from '@/lib/utils'
import { scoreDocument, scoreTone } from './client'

interface CvFitCardProps {
  applicationId: string
  fit: CvFitView | null
  /** The CV "Score now" scores; null when the user has no CV yet. */
  scoringDocument: { id: string; title: string } | null
}

function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return null
  const up = value > 0
  return (
    <span
      className={cn(
        'text-xs font-medium tabular-nums',
        up ? 'text-success' : 'text-danger',
      )}
    >
      {up ? '+' : ''}
      {value} since last score
    </span>
  )
}

function FitSummary({ fit }: { fit: CvFitView }) {
  const tone = scoreTone(fit.overall)
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <span className={cn('text-3xl font-bold tabular-nums', tone.text)}>{fit.overall}</span>
        <div className="pb-1 text-xs text-muted-foreground">
          <div>
            {fit.label} · grade {fit.grade}
          </div>
          <Delta value={fit.delta} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {fit.headlines.map((h) => (
          <div key={h.key} className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{h.label}</dt>
            <dd className={cn('font-medium tabular-nums', scoreTone(h.score).text)}>{h.score ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="truncate text-xs text-muted-foreground">Scored: {fit.sourceLabel || 'CV'}</p>
      {fit.mode === 'jd' && fit.overall < CV_FIT_TARGET ? (
        <p className="text-xs text-muted-foreground">
          Below {CV_FIT_TARGET}. Tailor your CV to this job before applying.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Application detail "CV fit" card: the latest Total Match for this job, the
 * headline scores, and a one-click re-score of the best CV for it.
 */
export function CvFitCard({ applicationId, fit, scoringDocument }: CvFitCardProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function scoreNow(): Promise<void> {
    if (!scoringDocument) return
    setBusy(true)
    const res = await scoreDocument(scoringDocument.id, applicationId)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`Scored ${res.data.total.score ?? 0}/100`)
    router.refresh()
  }

  const fullHref = `/cv-score?applicationId=${applicationId}${scoringDocument ? `&documentId=${scoringDocument.id}` : ''}`

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
          CV fit
        </CardTitle>
        <Link href={fullHref} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Full breakdown
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {fit ? (
          <FitSummary fit={fit} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Not scored yet. See how well your CV matches this job.
          </p>
        )}
        {scoringDocument ? (
          <Button type="button" size="sm" variant={fit ? 'outline' : 'default'} onClick={scoreNow} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? 'Scoring…' : fit ? 'Score again' : 'Score now'}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/cv">Add your CV to score it</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
