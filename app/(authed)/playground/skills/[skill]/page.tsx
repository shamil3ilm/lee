import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { levelName } from '@/lib/academy/levels'
import { skillDetail } from '@/lib/academy/service/views'
import { formatDateTime } from '@/lib/ui/date'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { HistoryList } from '@/components/playground/history-list'
import { LazyRatingChart } from '@/components/playground/lazy-rating-chart'
import { StartButton } from '@/components/playground/start-button'
import { levelBadge } from '@/components/playground/labels'

export const dynamic = 'force-dynamic'

const SKILL_RE = /^[a-z0-9][a-z0-9-]{0,47}$/

/** v13 §11 — one skill: level, what each level means, level over time, recent attempts. */
export default async function SkillPage({ params }: { params: Promise<{ skill: string }> }) {
  const userId = await requireUserId()
  const { skill } = await params
  if (!SKILL_RE.test(skill)) notFound()
  const detail = await skillDetail(userId, skill)
  if (!detail) notFound()
  const tz = await getUserTimeZone(userId)
  const points = detail.history.map((h) => ({ label: formatDateTime(h.at, 'date', tz), rating: Math.round(h.rating) }))
  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.name}
        description={`${detail.domain} · ${levelName(detail.level)}${detail.rating !== null ? ` · rating ${detail.rating} ±${detail.deviation}` : ''}`}
        actions={<StartButton kind="skill" id={detail.id} label="Practise now" variant="default" />}
      />
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1 pb-3">
            <CardTitle>Levels</CardTitle>
            <CardDescription>{detail.seedExplanation ?? 'Not seeded from your profile.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {detail.descriptors.map((d, i) => {
                const level = i + 1
                const current = level === detail.level
                return (
                  <li key={level} className="flex items-start gap-2 text-sm">
                    <Badge variant={current ? levelBadge(level) : 'outline'} className="shrink-0">
                      {levelName(level)}
                    </Badge>
                    <span className={current ? 'font-medium' : 'text-muted-foreground'}>{d}</span>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1 pb-3">
            <CardTitle>Level over time</CardTitle>
            <CardDescription>{detail.attempts} attempt{detail.attempts === 1 ? '' : 's'} so far.</CardDescription>
          </CardHeader>
          <CardContent>
            {points.length === 0 ? (
              <EmptyState size="sm" title="No history yet" description="Practise to start the line." />
            ) : (
              <div className="h-56">
                <LazyRatingChart data={points} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>On the path</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Builds on:</span>
            {detail.prerequisites.length === 0 ? <span>nothing; it is a starting point.</span> : null}
            {detail.prerequisites.map((p) => (
              <Link key={p.id} href={`/playground/skills/${p.id}`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                {p.name}
                <Badge variant={levelBadge(p.level)} className="px-1.5 py-0 text-[10px]">
                  {levelName(p.level)}
                </Badge>
              </Link>
            ))}
          </div>
          {detail.unlocks.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Leads to:</span>
              {detail.unlocks.map((u) => (
                <Link key={u.id} href={`/playground/skills/${u.id}`} className="text-primary underline-offset-4 hover:underline">
                  {u.name}
                </Link>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recent attempts</h2>
        <HistoryList entries={detail.recent} showSkill={false} />
      </section>
    </div>
  )
}
