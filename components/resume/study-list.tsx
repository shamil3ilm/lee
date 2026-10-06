'use client'
import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { patchStudyAction } from '@/app/(authed)/settings/profile/resume/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { DEPTH_LABELS } from '@/lib/resume/readiness'
import type { StudyItem, StudyPatch } from '@/lib/resume/study'

const KIND_LABELS = { project: 'Project', highlight: 'Highlight', skill: 'Skill' } as const

function StudyRow({ item }: { item: StudyItem }) {
  const [notes, setNotes] = useState(item.studyNotes)
  const [target, setTarget] = useState(item.studyTarget)
  const [owned, setOwned] = useState(item.ownedAspects)
  const [pending, start] = useTransition()
  const patch = (p: StudyPatch, message: string): void =>
    start(async () => {
      const r = await patchStudyAction(item.id, p)
      if ('error' in r) toast.error(r.error)
      else toast.success(message)
    })
  const id = `study-${item.id}`
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium">{item.label}</p>
            <p className="text-xs text-muted-foreground">
              {KIND_LABELS[item.kind]} · {item.context} · {DEPTH_LABELS[item.depth]}
            </p>
          </div>
          {item.interviewReady ? (
            <Badge variant="success">Interview-ready</Badge>
          ) : item.domainReady ? (
            <Badge variant="info">Design / domain ready</Badge>
          ) : (
            <Badge variant="warning">Studying</Badge>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem]">
          <FormField htmlFor={`${id}-owned`} label="What you own">
            <Input id={`${id}-owned`} value={owned} placeholder="The idea and domain model" onChange={(e) => setOwned(e.target.value)} />
          </FormField>
          <FormField htmlFor={`${id}-notes`} label="Notes">
            <Input id={`${id}-notes`} value={notes} placeholder="What to study" onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <FormField htmlFor={`${id}-target`} label="Target date">
            <Input id={`${id}-target`} type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => patch({ studyNotes: notes, studyTarget: target, ownedAspects: owned }, 'Saved')}>
            Save notes
          </Button>
          {!item.domainReady ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => patch({ domainReady: true }, 'Marked: you own the design / domain')}>
              I own the design / domain
            </Button>
          ) : null}
          {item.interviewReady ? (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => patch({ interviewReady: false }, 'Back on the study list')}>
              Not ready after all
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={pending} onClick={() => patch({ interviewReady: true }, 'Marked interview-ready')}>
              <CheckCircle2 /> Mark ready
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function StudyList({ items }: { items: StudyItem[] }) {
  if (items.length === 0) {
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nothing to study: every project, highlight and skill is marked as yours.</p>
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <StudyRow key={item.id} item={item} />
      ))}
    </div>
  )
}
