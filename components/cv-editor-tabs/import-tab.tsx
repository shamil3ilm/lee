'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { GitBranch, Loader2 } from 'lucide-react'
import type { CvProjects, MasterCV } from '@/lib/documents/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ImportTabProps {
  cv: MasterCV
  setCv: (cv: MasterCV) => void
  onMergeAndSave: (nextCv: MasterCV) => Promise<void>
}

export function ImportTab({ cv, setCv, onMergeAndSave }: ImportTabProps) {
  const [username, setUsername] = useState('')
  const [fetching, setFetching] = useState(false)
  const [merging, setMerging] = useState(false)
  const [proposed, setProposed] = useState<CvProjects>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function fetchProposal(): Promise<void> {
    const u = username.trim()
    if (!u) {
      toast.error('Enter a GitHub username.')
      return
    }
    setFetching(true)
    setProposed([])
    setSelected(new Set())
    try {
      const res = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: u }),
      })
      const json = (await res.json()) as { proposed?: CvProjects; error?: string }
      if (res.ok && json.proposed) {
        setProposed(json.proposed)
        setSelected(new Set(json.proposed.map((_, i) => i)))
        toast.success(`Found ${json.proposed.length} projects.`)
      } else {
        toast.error(json.error ?? 'Could not sync from GitHub.')
      }
    } catch {
      toast.error('Network error — could not sync from GitHub.')
    } finally {
      setFetching(false)
    }
  }

  function toggle(index: number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function mergeSelected(): Promise<void> {
    if (selected.size === 0) {
      toast.error('Select at least one project to merge.')
      return
    }
    const additions = proposed.filter((_, i) => selected.has(i))
    const existing = cv.projects ?? []
    // Dedupe by name (case-insensitive).
    const known = new Set(existing.map((p) => p.name.toLowerCase()))
    const merged = [...existing]
    for (const p of additions) {
      if (!known.has(p.name.toLowerCase())) {
        merged.push(p)
        known.add(p.name.toLowerCase())
      }
    }
    const nextCv: MasterCV = { ...cv, projects: merged }
    setCv(nextCv)
    setMerging(true)
    try {
      await onMergeAndSave(nextCv)
      setProposed([])
      setSelected(new Set())
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Sync from GitHub</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Fetch your public repos and let the AI distill 3–5 portfolio-worthy projects.
            Review, then merge into your master CV.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="github-username">GitHub username</Label>
              <Input
                id="github-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="octocat"
              />
            </div>
            <Button type="button" onClick={fetchProposal} disabled={fetching}>
              {fetching ? <Loader2 className="size-4 animate-spin" /> : null}
              {fetching ? 'Fetching…' : 'Fetch and distill'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {proposed.length > 0 ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Proposed projects</div>
              <div className="text-xs text-muted-foreground">
                {selected.size} of {proposed.length} selected
              </div>
            </div>
            <ul className="space-y-2">
              {proposed.map((p, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  <input
                    id={`prop-${i}`}
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-1 size-4 rounded border-input"
                  />
                  <label htmlFor={`prop-${i}`} className="min-w-0 flex-1 cursor-pointer">
                    <div className="font-medium">{p.name}</div>
                    {p.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                    ) : null}
                    {p.tech && p.tech.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.tech.join(' · ')}
                      </p>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button type="button" onClick={mergeSelected} disabled={merging}>
                {merging ? <Loader2 className="size-4 animate-spin" /> : null}
                {merging ? 'Merging…' : 'Merge into master CV'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
