import Link from 'next/link'
import { CalendarCheck, Flame, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DailyProblem } from '@/lib/academy/coding/daily'
import type { ProblemSummary } from '@/lib/academy/coding/list'
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/lib/academy/problems/constants'
import { DIFFICULTY_TONE } from './labels'

const BAR: Readonly<Record<(typeof DIFFICULTIES)[number], string>> = { easy: 'bg-success', medium: 'bg-warning', hard: 'bg-danger' }

export function ProgressBar({ value, total, className, label }: { value: number; total: number; className?: string; label: string }) {
  const pct = total === 0 ? 0 : Math.round((100 * value) / total)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className={`h-full rounded-full ${className ?? 'bg-primary'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SolvedCard({ summary }: { summary: ProblemSummary }) {
  const solved = DIFFICULTIES.reduce((s, d) => s + summary.solved[d], 0)
  const total = DIFFICULTIES.reduce((s, d) => s + summary.totals[d], 0)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" aria-hidden />
          Solved
        </CardTitle>
        <span className="text-sm tabular-nums text-muted-foreground" data-testid="solved-total">
          {solved}/{total}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {DIFFICULTIES.map((d) => (
          <div key={d} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <Badge variant={DIFFICULTY_TONE[d]}>{DIFFICULTY_LABELS[d]}</Badge>
              <span className="tabular-nums text-muted-foreground">
                {summary.solved[d]}/{summary.totals[d]}
              </span>
            </div>
            <ProgressBar value={summary.solved[d]} total={summary.totals[d]} className={BAR[d]} label={`${DIFFICULTY_LABELS[d]} solved`} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Your acceptance rate:{' '}
          <span className="font-medium tabular-nums text-foreground">{summary.acceptance === null ? '—' : `${summary.acceptance}%`}</span>
          {summary.submissions > 0 ? ` (${summary.accepted} of ${summary.submissions} submissions)` : ''}
        </p>
      </CardContent>
    </Card>
  )
}

export function DailyCard({ daily }: { daily: DailyProblem | null }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted-foreground" aria-hidden />
          Daily problem
        </CardTitle>
        <CardDescription>One problem a day, picked for your level. Solve it to keep the daily streak.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {daily ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/playground/problems/${daily.slug}`} className="font-medium text-primary underline-offset-4 hover:underline" data-testid="daily-link">
                {daily.title}
              </Link>
              <Badge variant={DIFFICULTY_TONE[daily.difficulty]}>{DIFFICULTY_LABELS[daily.difficulty]}</Badge>
              {daily.solved ? <Badge variant="success">Solved today</Badge> : null}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="size-3.5" aria-hidden />
              Daily streak: <span className="font-medium tabular-nums text-foreground">{daily.streak}</span> day{daily.streak === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No daily problem is available right now.</p>
        )}
      </CardContent>
    </Card>
  )
}
