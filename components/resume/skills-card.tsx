'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { isPublicItem, visibilityOf } from '@/lib/resume/visibility'
import { skillSchema, SKILL_KINDS, type SkillGroup, type SkillKind } from '@/lib/resume/types'
import { addedVisibility, move, newClientId, ReadinessControls, removeAt, replaceAt, RowActions, useFactsLocked, VisibilityToggle } from './controls'

interface SkillsCardProps {
  value: SkillGroup[]
  onChange: (next: SkillGroup[]) => void
}

const KIND_LABELS: Readonly<Record<SkillKind, string>> = { tech: 'Tech', domain: 'Domain' }

function AddSkill({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  const add = (): void => {
    if (name.trim()) onAdd(name.trim())
    setName('')
  }
  return (
    <div className="flex gap-2">
      <Input
        aria-label="New skill"
        value={name}
        placeholder="Add a skill"
        className="h-8 text-xs"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
      />
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={add} disabled={!name.trim()}>
        <Plus className="size-3.5" /> Add
      </Button>
    </div>
  )
}

export function SkillsCard({ value, onChange }: SkillsCardProps) {
  const locked = useFactsLocked()
  const setGroup = (i: number, g: SkillGroup): void => onChange(replaceAt(value, i, g))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
        <CardDescription>
          A skill is offered for variants and role suggestions when you mark it ready or an interview-ready item mentions it. Domain skills (e.g. “ZATCA requirements”) can be ready on their own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {value.map((g, i) => {
          // A public group's name and skill list come from the portfolio; kind and readiness stay editable.
          const ro = locked && isPublicItem('skills', g)
          return (
          <section key={g.id} aria-label={g.name || `Skill group ${i + 1}`} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Skill group ${i + 1} name`} value={g.name} readOnly={ro} className="h-8 max-w-xs flex-1" onChange={(e) => setGroup(i, { ...g, name: e.target.value })} />
              <VisibilityToggle label={`Group ${g.name}`} value={visibilityOf('skills', g, '_item')} onChange={(v) => setGroup(i, { ...g, visibility: { ...g.visibility, _item: v } })} />
              {ro ? null : (
                <div className="ml-auto">
                  <RowActions index={i} count={value.length} label={`group ${g.name}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
                </div>
              )}
            </div>
            <ul className="divide-y">
              {g.skills.map((s, j) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="min-w-24 text-sm font-medium">{s.name}</span>
                  <NativeSelect
                    aria-label={`${s.name} kind`}
                    value={s.kind}
                    className="h-7 w-auto text-xs"
                    onChange={(e) => setGroup(i, { ...g, skills: replaceAt(g.skills, j, { ...s, kind: e.target.value as SkillKind }) })}
                  >
                    {SKILL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </NativeSelect>
                  <ReadinessControls label={s.name} value={s} compact onChange={(patch) => setGroup(i, { ...g, skills: replaceAt(g.skills, j, { ...s, ...patch }) })} />
                  {ro ? null : (
                    <button type="button" aria-label={`Remove ${s.name}`} className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setGroup(i, { ...g, skills: removeAt(g.skills, j) })}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {ro ? null : <AddSkill onAdd={(name) => setGroup(i, { ...g, skills: [...g.skills, skillSchema.parse({ id: newClientId('sk'), name, depth: 'own' })] })} />}
          </section>
          )
        })}
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { id: newClientId('g'), name: 'New group', level: '', skills: [], visibility: addedVisibility(locked) }])}>
          <Plus className="size-3.5" /> {locked ? 'Add private skill group' : 'Add skill group'}
        </Button>
      </CardContent>
    </Card>
  )
}
