import Link from 'next/link'
import { BookOpen, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { levelName } from '@/lib/academy/levels'
import { targetDay, type ReadySuggestion, type UnmappedStudyItem } from '@/lib/academy/placement/study'
import type { StudyRow } from '@/lib/academy/service/hub'
import { DEPTH_LABELS } from '@/lib/resume/readiness'
import type { Depth } from '@/lib/resume/types'
import { shortDay } from '@/lib/ui/date'
import { levelBadge } from './labels'

interface StudyCardProps {
  study: StudyRow[]
  unmapped: UnmappedStudyItem[]
  suggestions: ReadySuggestion[]
}

function depthLabel(depth: string): string {
  return DEPTH_LABELS[depth as Depth] ?? depth
}

function Target({ date }: { date: string }) {
  const day = targetDay(date)
  return <span className="tabular-nums">{day ? `Target ${shortDay(day)}` : 'No target date'}</span>
}

/**
 * "Your study list": the profile's AI-assisted and learning items mapped to
 * skills. Readiness stays the user's call: at Competent the Playground only
 * suggests marking an item interview-ready, with a link to the study list.
 */
export function StudyCard({ study, unmapped, suggestions }: StudyCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          Your study list
        </CardTitle>
        <CardDescription>
          AI-assisted and learning items from your profile. They are practice targets, never proof of a level.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.length > 0 ? (
          <ul className="space-y-2" aria-label="Suggestions">
            {suggestions.map((s) => (
              <li key={s.studyItemId} className="flex gap-2 rounded-lg bg-info-soft p-3 text-xs text-info">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                  {s.message}{' '}
                  <Link href="/settings/profile/study" className="font-medium underline underline-offset-4">
                    Open study list
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {study.length === 0 && unmapped.length === 0 ? (
          <EmptyState
            size="sm"
            title="Nothing on your study list"
            description="Mark profile items as AI-assisted or learning to practise them here."
            action={
              <Link href="/settings/profile/study" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                Open study list
              </Link>
            }
          />
        ) : (
          <ul className="divide-y" aria-label="Study targets">
            {study.map((t) => (
              <li key={`${t.studyItemId}:${t.skillId}`} className="space-y-1 py-2 first:pt-0 last:pb-0">
                <p className="break-words text-sm font-medium">{t.label}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Link href={`/playground/skills/${t.skillId}`} className="text-primary underline-offset-4 hover:underline">
                    {t.skillName}
                  </Link>
                  <Badge variant={levelBadge(t.level)} className="px-1.5 py-0 text-[10px]">
                    {levelName(t.level)}
                  </Badge>
                  <span>{depthLabel(t.depth)}</span>
                  <Target date={t.targetDate} />
                </div>
                {t.notes ? <p className="break-words text-xs text-muted-foreground">{t.notes}</p> : null}
              </li>
            ))}
            {unmapped.map((u) => (
              <li key={u.studyItemId} className="space-y-1 py-2 first:pt-0 last:pb-0">
                <p className="break-words text-sm font-medium">{u.label}</p>
                <p className="text-xs text-muted-foreground">Not mapped to a Playground skill yet.</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
