'use client'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { MasterCV } from '@/lib/documents/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Experience = MasterCV['experience'][number]

interface ExperienceTabProps {
  cv: MasterCV
  setCv: (cv: MasterCV) => void
}

function empty(): Experience {
  return {
    company: '',
    role: '',
    location: '',
    start: '',
    end: 'present',
    bullets: [],
    tech: [],
  }
}

function bulletsFromText(v: string): string[] {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function csvToArr(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function ExperienceTab({ cv, setCv }: ExperienceTabProps) {
  const items = cv.experience

  function replace(next: Experience[]): void {
    setCv({ ...cv, experience: next })
  }

  function update(index: number, patch: Partial<Experience>): void {
    replace(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function move(index: number, direction: -1 | 1): void {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [it] = next.splice(index, 1)
    if (it) next.splice(target, 0, it)
    replace(next)
  }

  function remove(index: number): void {
    replace(items.filter((_, i) => i !== index))
  }

  function add(): void {
    replace([...items, empty()])
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No experience yet. Add your first role below.
          </CardContent>
        </Card>
      ) : (
        items.map((it, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Role #{i + 1}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(i)}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`exp-${i}-company`}>Company</Label>
                  <Input
                    id={`exp-${i}-company`}
                    value={it.company}
                    onChange={(e) => update(i, { company: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`exp-${i}-role`}>Role</Label>
                  <Input
                    id={`exp-${i}-role`}
                    value={it.role}
                    onChange={(e) => update(i, { role: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`exp-${i}-location`}>Location</Label>
                  <Input
                    id={`exp-${i}-location`}
                    value={it.location ?? ''}
                    onChange={(e) => update(i, { location: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`exp-${i}-start`}>Start (YYYY-MM)</Label>
                    <Input
                      id={`exp-${i}-start`}
                      value={it.start}
                      placeholder="2020-06"
                      onChange={(e) => update(i, { start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`exp-${i}-end`}>End</Label>
                    <Input
                      id={`exp-${i}-end`}
                      value={it.end}
                      placeholder="present or 2023-11"
                      onChange={(e) => update(i, { end: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`exp-${i}-bullets`}>Bullets (one per line)</Label>
                <Textarea
                  id={`exp-${i}-bullets`}
                  rows={5}
                  value={it.bullets.join('\n')}
                  onChange={(e) => update(i, { bullets: bulletsFromText(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`exp-${i}-tech`}>Tech (comma separated)</Label>
                <Input
                  id={`exp-${i}-tech`}
                  value={(it.tech ?? []).join(', ')}
                  onChange={(e) => update(i, { tech: csvToArr(e.target.value) })}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={add} size="sm">
          <Plus className="size-4" />
          Add role
        </Button>
      </div>
    </div>
  )
}
