import { CalendarDays, Code2, Flame } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { codingStats } from '@/lib/academy/coding/stats'
import { LANGUAGE_LABELS, type CodeLanguage } from '@/lib/academy/problems/schema'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Heatmap } from '@/components/playground/problems/heatmap'
import { ProgressBar, SolvedCard } from '@/components/playground/problems/summary-cards'

export const dynamic = 'force-dynamic'

/** Coding profile stats: solved by difficulty, the submission calendar and languages. */
export default async function ProblemStatsPage() {
  const userId = await requireUserId()
  const stats = await codingStats(userId)
  const totalLang = stats.languages.reduce((s, l) => s + l.count, 0)
  return (
    <div className="space-y-6">
      <PageHeader title="Coding stats" description="What you have solved, when you practised and in which languages." />
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        <SolvedCard summary={stats.summary} />
        <Card>
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Code2 className="size-4 text-muted-foreground" aria-hidden />
              Languages
            </CardTitle>
            <CardDescription>Every coding submission, all time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.languages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              stats.languages.map((l) => (
                <div key={l.language} className="space-y-1" data-testid="language-row">
                  <div className="flex justify-between text-sm">
                    <span>{LANGUAGE_LABELS[l.language as CodeLanguage] ?? l.language}</span>
                    <span className="tabular-nums text-muted-foreground">{l.count}</span>
                  </div>
                  <ProgressBar value={l.count} total={totalLang} label={`${l.language} share`} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            Submission calendar
          </CardTitle>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{stats.activeDays} active days</span>
            <span className="flex items-center gap-1 tabular-nums">
              <Flame className="size-3.5" aria-hidden />
              Daily streak {stats.dailyStreak} (best {stats.bestDailyStreak})
            </span>
          </span>
        </CardHeader>
        <CardContent>
          <Heatmap days={stats.heatmap} />
        </CardContent>
      </Card>
    </div>
  )
}
