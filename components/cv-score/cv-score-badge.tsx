import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { overallLabel, type DocScore } from '@/lib/cv-score/fit'
import { scoreTone } from './client'
import { cn } from '@/lib/utils'

interface CvScoreBadgeProps {
  documentId: string
  /** Absent when the document has never been scored. */
  score: DocScore | undefined
  /** Rendered instead of the badge for an unscored document. */
  fallback?: React.ReactNode
  className?: string
}

/**
 * Latest CV score for a document, as a small colour-banded badge that opens
 * the full breakdown on /cv-score. Server- and client-safe (no hooks).
 */
export function CvScoreBadge({ documentId, score, fallback = null, className }: CvScoreBadgeProps) {
  if (!score) return fallback
  const label = overallLabel(score.mode)
  const tone = scoreTone(score.overall)
  return (
    <Link
      href={`/cv-score?documentId=${documentId}`}
      aria-label={`${label} ${score.overall} of 100. Open CV score`}
      title={`${label}: ${score.overall}/100`}
      className={cn('inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <Badge variant="outline" className={cn('border-transparent text-[10px] tabular-nums', tone.bg, tone.text)}>
        {score.overall}
      </Badge>
    </Link>
  )
}
