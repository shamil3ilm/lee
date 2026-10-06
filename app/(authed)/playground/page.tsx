import Link from 'next/link'
import { ArrowRight, Beaker, Compass, Settings2, Swords, type LucideIcon } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { getHubData, type HubData } from '@/lib/academy/service/hub'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AchievementsCard } from '@/components/playground/achievements-card'
import { InterviewCard } from '@/components/playground/interview-card'
import { PlanCard } from '@/components/playground/plan-card'
import { PrefsForm } from '@/components/playground/prefs-form'
import { RadarCard } from '@/components/playground/radar-card'
import { StartButton } from '@/components/playground/start-button'
import { StatTiles } from '@/components/playground/stat-tiles'
import { StudyCard } from '@/components/playground/study-card'

export const dynamic = 'force-dynamic'

/**
 * v13 §11 — the Playground hub: today's adaptive plan, rank / XP / streak,
 * the skill radar, due reviews, upcoming-interview focus and the study list.
 * Models and Decisions (v14, decision playground) live in their own tabs.
 */

interface Section {
  key: string
  title: string
  description: string
  icon: LucideIcon
  href: string
  cta: string
}

const MORE: readonly Section[] = [
  {
    key: 'models',
    title: 'Models',
    description: 'Run one prompt against several free open-source models side by side and keep a blind-vote leaderboard.',
    icon: Swords,
    href: '/playground/models',
    cta: 'Open Model Playground',
  },
  {
    key: 'decisions',
    title: 'Decisions',
    description: 'Try classification, yes/no and score prompts against each decision provider.',
    icon: Beaker,
    href: '/playground/decisions',
    cta: 'Open Decisions',
  },
]

function PlacementCard({ placement }: { placement: HubData['placement'] }) {
  if (placement.done) return null
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Compass className="size-4 text-muted-foreground" aria-hidden />
          Placement check
        </CardTitle>
        <CardDescription>
          Your profile seeds a starting level only from items you marked interview-ready. A few quick items per domain
          ({placement.remaining} left) adjust it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StartButton kind="placement" label={placement.started ? 'Continue placement' : 'Start placement'} variant="default" />
      </CardContent>
    </Card>
  )
}

function MoreCards() {
  return (
    <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
      {MORE.map((s) => {
        const Icon = s.icon
        return (
          <Card key={s.key}>
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {s.title}
              </CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={s.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                {s.cta} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default async function PlaygroundPage() {
  const userId = await requireUserId()
  const hub = await getHubData(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Playground"
        description="Adaptive practice that follows your level, your study list and your next interview."
      />
      <StatTiles
        rankLabel={hub.rankLabel}
        nextRank={hub.nextRank}
        xp={hub.xp}
        streak={hub.streak}
        bestStreak={hub.bestStreak}
        dueReviews={hub.dueReviews}
      />
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <PlanCard items={hub.plan} budget={hub.timeBudgetMin} />
          <PlacementCard placement={hub.placement} />
        </div>
        <RadarCard radar={hub.radar} assessed={hub.assessedSkills} />
      </div>
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        <InterviewCard interviews={hub.interviews} />
        <StudyCard study={hub.study} unmapped={hub.unmappedStudy} suggestions={hub.suggestions} />
      </div>
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" aria-hidden />
              Practice settings
            </CardTitle>
            <CardDescription>How long the daily plan may take, and its style.</CardDescription>
          </CardHeader>
          <CardContent>
            <PrefsForm timeBudgetMin={hub.timeBudgetMin} mode={hub.mode} />
          </CardContent>
        </Card>
        <AchievementsCard achievements={hub.achievements} />
      </div>
      <MoreCards />
    </div>
  )
}
