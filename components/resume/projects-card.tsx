'use client'
import { plural } from '@/lib/ui/labels'
import { useState } from 'react'
import { GitBranch, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import type { CvProjects } from '@/lib/documents/types'
import { isPublicItem, visibilityOf } from '@/lib/resume/visibility'
import { projectSchema, type ProjectItem } from '@/lib/resume/types'
import { addedVisibility, move, newClientId, ReadinessControls, removeAt, replaceAt, RowActions, useFactsLocked, VisibilityToggle } from './controls'
import { HighlightsEditor } from './highlights-editor'
import { csv, fromCsv } from './work-card'

interface ProjectsCardProps {
  value: ProjectItem[]
  onChange: (next: ProjectItem[]) => void
}

/**
 * GitHub import: AI-distilled projects arrive as `ai_assisted`, not
 * interview-ready, until you say otherwise.
 */
function GitHubImport({ onImport }: { onImport: (items: ProjectItem[]) => void }) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    if (!username.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/github/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: username.trim() }) })
      const json = (await res.json()) as { proposed?: CvProjects; error?: string }
      if (!res.ok || !json.proposed) {
        toast.error(json.error ?? 'Could not import from GitHub.')
        return
      }
      onImport(
        json.proposed.map((p) =>
          projectSchema.parse({
            id: newClientId('pr'),
            name: p.name,
            description: p.description.slice(0, 200),
            url: p.url ?? '',
            keywords: p.tech ?? [],
            highlights: (p.highlights ?? []).map((t) => ({ id: newClientId('h'), text: t, depth: 'ai_assisted' })),
            depth: 'ai_assisted',
          }),
        ),
      )
      toast.success(`Added ${plural(json.proposed.length, 'project')} — review them, then save.`)
    } catch {
      toast.error('Could not reach GitHub.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-end">
      <FormField htmlFor="gh-username" label="Import from GitHub" hint="(public repos, AI-distilled)" className="flex-1">
        <Input id="gh-username" value={username} placeholder="GitHub username" onChange={(e) => setUsername(e.target.value)} />
      </FormField>
      <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => void run()} disabled={busy || !username.trim()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranch className="size-3.5" />} Import
      </Button>
    </div>
  )
}

export function ProjectsCard({ value, onChange }: ProjectsCardProps) {
  const locked = useFactsLocked()
  const set = (i: number, patch: Partial<ProjectItem>): void => onChange(replaceAt(value, i, { ...value[i]!, ...patch }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          Mark how well you know each one. Only interview-ready projects reach variants and tailored CVs by default; the portfolio shows whatever you make public.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {value.map((p, i) => {
          const id = `project-${p.id}`
          const ro = locked && isPublicItem('projects', p)
          return (
            <section key={p.id} aria-label={p.name || `Project ${i + 1}`} className="space-y-3 rounded-lg border p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <VisibilityToggle label={`Project ${p.name || i + 1}`} value={visibilityOf('projects', p, '_item')} onChange={(v) => set(i, { visibility: { ...p.visibility, _item: v } })} />
                  <ReadinessControls label={`Project ${p.name || i + 1}`} value={p} onChange={(patch) => set(i, patch)} />
                </div>
                {ro ? null : (
                  <RowActions index={i} count={value.length} label={`project ${p.name || i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset disabled={ro} className="contents">
                <FormField htmlFor={`${id}-name`} label="Name">
                  <Input id={`${id}-name`} value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-url`} label="URL" hint="(optional)">
                  <Input id={`${id}-url`} type="url" value={p.url} onChange={(e) => set(i, { url: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-description`} label="One-line description" className="sm:col-span-2">
                  <Input id={`${id}-description`} value={p.description} maxLength={200} onChange={(e) => set(i, { description: e.target.value })} />
                </FormField>
                <FormField htmlFor={`${id}-keywords`} label="Stack" hint="(comma separated)">
                  <Input id={`${id}-keywords`} value={csv(p.keywords)} onChange={(e) => set(i, { keywords: fromCsv(e.target.value) })} />
                </FormField>
                </fieldset>
                {p.depth !== 'own' ? (
                  <FormField htmlFor={`${id}-owned`} label="What you own" hint="(private)">
                    <Input id={`${id}-owned`} value={p.ownedAspects} placeholder="The domain model and the clearance rules" onChange={(e) => set(i, { ownedAspects: e.target.value })} />
                  </FormField>
                ) : null}
              </div>
              <HighlightsEditor owner={p.name || `Project ${i + 1}`} value={p.highlights} factsLocked={ro} onChange={(highlights) => set(i, { highlights })} />
            </section>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...value, projectSchema.parse({ id: newClientId('pr'), name: 'New project', depth: 'own', visibility: addedVisibility(locked) })])}
          >
            <Plus className="size-3.5" /> {locked ? 'Add private project' : 'Add project'}
          </Button>
        </div>
        {/* GitHub import adds public projects: only while public facts are edited in lee. */}
        {locked ? null : (
          <GitHubImport onImport={(items) => onChange([...value, ...items.filter((x) => !value.some((p) => p.name.toLowerCase() === x.name.toLowerCase()))])} />
        )}
      </CardContent>
    </Card>
  )
}
