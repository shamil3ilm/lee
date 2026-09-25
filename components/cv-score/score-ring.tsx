import { cn } from '@/lib/utils'
import { scoreTone } from './client'

interface ScoreRingProps {
  score: number | null
  grade: string | null
  label: string
  size?: number
  className?: string
}

/** Circular score gauge (0–100) with the grade in the middle. */
export function ScoreRing({ score, grade, label, size = 148, className }: ScoreRingProps) {
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100
  const tone = scoreTone(score)
  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn('transition-[stroke-dashoffset] duration-700', tone.text)}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`${label}: ${score ?? 'not scored'}${grade ? `, grade ${grade}` : ''}`}>
        <span className={cn('text-4xl font-bold tabular-nums', tone.text)}>{score ?? '—'}</span>
        <span className="text-xs text-muted-foreground">{grade ? `Grade ${grade}` : 'no score'}</span>
      </div>
    </div>
  )
}

/** Thin horizontal score bar. */
export function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  const tone = scoreTone(score)
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
    </div>
  )
}
