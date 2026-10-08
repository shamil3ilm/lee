'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { BookOpen, Check, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { addGapToStudyAction } from '@/app/(authed)/cv-fit-actions'
import type { Gap } from '@/lib/cv-fit/tailor/types'

function StudyButton({ applicationId, gap, done, onDone }: { applicationId: string; gap: Gap; done: boolean; onDone: () => void }) {
  const [pending, start] = useTransition()
  const add = (): void =>
    start(async () => {
      const r = await addGapToStudyAction(applicationId, gap.requirementId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.created ? `${r.label} is on your study list` : `${r.label} was already on your study list`)
      onDone()
    })
  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <Check className="size-3.5" aria-hidden="true" />
        On your study list
      </span>
    )
  }
  return (
    <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={add}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <BookOpen className="size-4" />}
      Add to study list
    </Button>
  )
}

/**
 * Missing requirements: never added to the CV. Each can go on the study
 * list (a learning item mapped to Playground skills), be answered with real
 * adjacent experience in the cover letter (only when there is some, with
 * its source shown), or be left alone.
 */
export function GapList({
  applicationId,
  gaps,
  cover,
  studied,
  onCover,
  onStudied,
  disabled,
}: {
  applicationId: string
  gaps: readonly Gap[]
  cover: ReadonlySet<string>
  studied: ReadonlySet<string>
  onCover: (id: string, on: boolean) => void
  onStudied: (id: string) => void
  disabled?: boolean
}) {
  if (gaps.length === 0) return <p className="text-xs text-muted-foreground">No gaps: your ready profile covers every requirement lee can check.</p>
  return (
    <ul className="space-y-2" aria-label="Gaps" data-testid="tailor-gaps">
      {gaps.map((g) => (
        <li key={g.requirementId} className="space-y-2 rounded-lg border border-danger/30 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="danger">Missing</Badge>
            <Badge variant="outline">{g.weight === 'must' ? 'Must-have' : 'Nice to have'}</Badge>
          </div>
          <p className="text-sm leading-snug">{g.text}</p>
          <p className="text-[11px] text-muted-foreground">
            Not added to your CV. {g.playground.length > 0 ? `Practice it in the Playground: ${g.playground.join(', ')}.` : 'No Playground skill covers it yet.'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <StudyButton applicationId={applicationId} gap={g} done={studied.has(g.requirementId)} onDone={() => onStudied(g.requirementId)} />
            {g.adjacent ? (
              <Checkbox
                checked={cover.has(g.requirementId)}
                disabled={disabled}
                onChange={(e) => onCover(g.requirementId, e.currentTarget.checked)}
                label="Mention adjacent experience in the cover letter"
                description={`From your profile: “${g.adjacent.text}”`}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
