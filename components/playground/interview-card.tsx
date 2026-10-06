import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { LocalTime } from '@/components/local-time'
import { levelName } from '@/lib/academy/levels'
import type { InterviewFocus } from '@/lib/academy/service/hub'
import { levelBadge } from './labels'

/** "For your upcoming interview": stages in the next 7 days and their mapped skills. */
export function InterviewCard({ interviews }: { interviews: InterviewFocus[] }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          For your upcoming interview
        </CardTitle>
        <CardDescription>Scheduled stages in the next 7 days, with the skills they map to.</CardDescription>
      </CardHeader>
      <CardContent>
        {interviews.length === 0 ? (
          <EmptyState size="sm" title="No interviews this week" description="When a stage is scheduled, its skills move up your plan." />
        ) : (
          <ul className="space-y-4">
            {interviews.map((i) => (
              <li key={i.stageId} className="space-y-2">
                <p className="break-words text-sm font-medium">
                  {i.label}
                  {i.company ? ` · ${i.company}` : ''}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    <LocalTime date={i.scheduledAt} format="datetime" />
                  </span>
                </p>
                <ul className="flex flex-wrap gap-2" aria-label={`Skills for the ${i.label} interview`}>
                  {i.skills.map((s) => (
                    <li key={s.id}>
                      <Link href={`/playground/skills/${s.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                        <span className="break-words">{s.name}</span>
                        <Badge variant={levelBadge(s.level)} className="px-1.5 py-0 text-[10px]">
                          {levelName(s.level)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
