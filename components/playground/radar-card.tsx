import { Radar as RadarIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { RadarPoint } from '@/lib/academy/service/hub'
import { SkillRadar } from './skill-radar'

export function RadarCard({ radar, assessed }: { radar: RadarPoint[]; assessed: number }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <RadarIcon className="size-4 text-muted-foreground" aria-hidden />
          Skill radar
        </CardTitle>
        <CardDescription>Average level per domain, 0 (unassessed) to 5 (expert).</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {assessed === 0 ? (
          <EmptyState size="sm" title="No levels yet" description="Take the placement check or finish an item to fill the radar." />
        ) : (
          <>
            <div className="h-64">
              <SkillRadar data={radar} />
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Levels by domain</summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {radar.map((r) => (
                  <li key={r.domainId} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{r.domain}</span>
                    <span className="tabular-nums text-muted-foreground">{r.level > 0 ? r.level.toFixed(1) : '–'}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  )
}
