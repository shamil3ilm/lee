import { ExternalLink } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { Confidence, SourceRef } from '@/lib/compare/evidence'

/** Shared bits of the comparison UI: confidence badge and a source line. */

const CONFIDENCE: Readonly<Record<Confidence, { label: string; variant: BadgeProps['variant'] }>> = {
  known: { label: 'Known', variant: 'info' },
  estimated: { label: 'Estimate', variant: 'warning' },
  unknown: { label: 'Unknown', variant: 'neutral' },
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const c = CONFIDENCE[confidence]
  return (
    <Badge variant={c.variant} className="text-[10px]">
      {c.label}
    </Badge>
  )
}

export function ScoreText({ score }: { score: number | null }) {
  return score === null ? <span className="text-muted-foreground">Unknown</span> : <span className="tabular-nums">{score}</span>
}

/** "Source: Posting — “Annual air ticket…”" with a link when there is one. */
export function SourceLine({ source }: { source: SourceRef | null }) {
  if (!source) return null
  const external = source.url?.startsWith('http')
  const label = source.url ? (
    <a
      href={source.url}
      className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {source.label}
      {external ? <ExternalLink className="size-3" aria-hidden="true" /> : null}
    </a>
  ) : (
    source.label
  )
  return (
    <span className="text-xs text-muted-foreground">
      Source: {label}
      {source.quote ? <q className="ml-1 italic">{source.quote}</q> : null}
    </span>
  )
}
