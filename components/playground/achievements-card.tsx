import { Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { LocalTime } from '@/components/local-time'
import type { HubData } from '@/lib/academy/service/hub'

export function AchievementsCard({ achievements }: { achievements: HubData['achievements'] }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" aria-hidden />
          Achievements
        </CardTitle>
        <CardDescription>Earned from what you do, never from volume alone.</CardDescription>
      </CardHeader>
      <CardContent>
        {achievements.length === 0 ? (
          <EmptyState size="sm" title="None yet" description="Finish your first item to earn one." />
        ) : (
          <ul className="space-y-2">
            {achievements.slice(0, 6).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="min-w-0 break-words">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground"> · {a.description}</span>
                </span>
                <LocalTime date={a.earnedAt} format="date" className="text-xs text-muted-foreground" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
