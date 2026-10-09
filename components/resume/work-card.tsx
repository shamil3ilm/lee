'use client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { isPublicItem, visibilityOf } from '@/lib/resume/visibility'
import { workSchema, type WorkItem } from '@/lib/resume/types'
import { addedVisibility, move, newClientId, removeAt, replaceAt, RowActions, useFactsLocked, VisibilityToggle } from './controls'
import { HighlightsEditor } from './highlights-editor'

interface WorkCardProps {
  value: WorkItem[]
  onChange: (next: WorkItem[]) => void
}

function csv(list: readonly string[]): string {
  return list.join(', ')
}
function fromCsv(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

export function WorkCard({ value, onChange }: WorkCardProps) {
  const locked = useFactsLocked()
  const set = (i: number, patch: Partial<WorkItem>): void => onChange(replaceAt(value, i, { ...value[i]!, ...patch }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Work</CardTitle>
        <CardDescription>Jobs, newest first. Dates as YYYY or YYYY-MM; leave the end empty for “Present”.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {value.map((w, i) => {
          const id = `work-${w.id}`
          const ro = locked && isPublicItem('work', w)
          return (
            <section key={w.id} aria-label={w.name || `Job ${i + 1}`} className="space-y-3 rounded-lg border p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <VisibilityToggle label={`Job ${w.name || i + 1}`} value={visibilityOf('work', w, '_item')} onChange={(v) => set(i, { visibility: { ...w.visibility, _item: v } })} />
                {ro ? null : (
                  <RowActions index={i} count={value.length} label={`job ${w.name || i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
                )}
              </div>
              <fieldset disabled={ro} className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField htmlFor={`${id}-name`} label="Company">
                  <Input id={`${id}-name`} value={w.name} onChange={(e) => set(i, { name: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-position`} label="Position">
                  <Input id={`${id}-position`} value={w.position} onChange={(e) => set(i, { position: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-location`} label="Location">
                  <Input id={`${id}-location`} value={w.location} onChange={(e) => set(i, { location: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-url`} label="Company URL" hint="(optional)">
                  <Input id={`${id}-url`} type="url" value={w.url} onChange={(e) => set(i, { url: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-start`} label="Start">
                  <Input id={`${id}-start`} value={w.startDate} placeholder="2021-04" onChange={(e) => set(i, { startDate: e.target.value.trim() })} />
                </FormField>
                <FormField htmlFor={`${id}-end`} label="End" hint="(empty = Present)">
                  <Input id={`${id}-end`} value={w.endDate} placeholder="2023-06" onChange={(e) => set(i, { endDate: e.target.value.trim() })} />
                </FormField>
              </fieldset>
              <FormField htmlFor={`${id}-keywords`} label="Stack" hint="(comma separated; private, used for matching)">
                <Input id={`${id}-keywords`} value={csv(w.keywords)} onChange={(e) => set(i, { keywords: fromCsv(e.target.value) })} />
              </FormField>
              <HighlightsEditor owner={w.name || `Job ${i + 1}`} value={w.highlights} factsLocked={ro} onChange={(highlights) => set(i, { highlights })} />
            </section>
          )
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...value, workSchema.parse({ id: newClientId('w'), name: 'Company', position: 'Role', visibility: addedVisibility(locked) })])}
        >
          <Plus className="size-3.5" /> {locked ? 'Add private job' : 'Add job'}
        </Button>
      </CardContent>
    </Card>
  )
}

export { csv, fromCsv }
