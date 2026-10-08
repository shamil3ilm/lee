import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { RadarPoint } from '@/lib/academy/service/hub'
import { SkillLevels } from './skill-levels'

/** Skill levels per domain, strongest first (sorted bars, not a radar). */
export function RadarCard({ radar, assessed }: { radar: RadarPoint[]; assessed: number }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
          Skill levels
        </CardTitle>
        <CardDescription>Average level per domain, 0 (unassessed) to 5 (expert), strongest first.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {assessed === 0 ? (
          <EmptyState size="sm" title="No levels yet" description="Take the placement check or finish an item to fill in your levels." />
        ) : (
          <SkillLevels data={radar} />
        )}
      </CardContent>
    </Card>
  )
}
