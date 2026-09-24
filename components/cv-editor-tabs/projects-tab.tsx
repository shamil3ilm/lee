'use client'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { MasterCV } from '@/lib/documents/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Project = NonNullable<MasterCV['projects']>[number]

interface ProjectsTabProps {
  cv: MasterCV
  setCv: (cv: MasterCV) => void
}

function empty(): Project {
  return { name: '', description: '', url: '', tech: [], highlights: [] }
}

function csvToArr(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function linesToArr(v: string): string[] {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function ProjectsTab({ cv, setCv }: ProjectsTabProps) {
  const items = cv.projects ?? []

  function replace(next: Project[]): void {
    setCv({ ...cv, projects: next })
  }

  function update(index: number, patch: Partial<Project>): void {
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
            No projects yet. Add one or sync from GitHub in the Import tab.
          </CardContent>
        </Card>
      ) : (
        items.map((it, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Project #{i + 1}
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
                  <Label htmlFor={`proj-${i}-name`}>Name</Label>
                  <Input
                    id={`proj-${i}-name`}
                    value={it.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`proj-${i}-url`}>URL</Label>
                  <Input
                    id={`proj-${i}-url`}
                    value={it.url ?? ''}
                    onChange={(e) => update(i, { url: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`proj-${i}-description`}>Description</Label>
                <Textarea
                  id={`proj-${i}-description`}
                  rows={3}
                  value={it.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`proj-${i}-tech`}>Tech (comma separated)</Label>
                <Input
                  id={`proj-${i}-tech`}
                  value={(it.tech ?? []).join(', ')}
                  onChange={(e) => update(i, { tech: csvToArr(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`proj-${i}-highlights`}>Highlights (one per line)</Label>
                <Textarea
                  id={`proj-${i}-highlights`}
                  rows={3}
                  value={(it.highlights ?? []).join('\n')}
                  onChange={(e) => update(i, { highlights: linesToArr(e.target.value) })}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={add} size="sm">
          <Plus className="size-4" />
          Add project
        </Button>
      </div>
    </div>
  )
}
