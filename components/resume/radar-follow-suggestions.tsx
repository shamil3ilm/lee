'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { addReleaseProjectsAction, suggestRadarFollowsAction } from '@/app/(authed)/settings/resume/github-actions'
import type { FollowSuggestion } from '@/lib/integrations/github/follow'

/** Starred repos and dependencies of followed repos, as Radar release suggestions to confirm. */
export function RadarFollowSuggestions() {
  const [pending, start] = useTransition()
  const [list, setList] = useState<FollowSuggestion[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [starredUnavailable, setStarredUnavailable] = useState(false)

  const load = (): void => {
    start(async () => {
      const r = await suggestRadarFollowsAction()
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setList(r.suggestions)
      setPicked(new Set(r.suggestions.map((s) => s.id)))
      setStarredUnavailable(r.starredUnavailable)
    })
  }

  const add = (): void => {
    start(async () => {
      const r = await addReleaseProjectsAction([...picked])
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(`Added ${r.added} to Radar’s release list.`)
        setList(null)
      }
    })
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Radar: follow releases of your starred repos and of the dependencies of repos you follow.</p>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={load}>
          Suggest Radar releases
        </Button>
      </div>
      {starredUnavailable ? <p className="text-xs text-warning">Starred repos need the app’s optional Starring (read) permission.</p> : null}
      {list ? (
        list.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing new to follow.</p>
        ) : (
          <div className="space-y-1.5" data-testid="radar-follow-suggestions">
            {list.map((s) => (
              <Checkbox
                key={s.id}
                checked={picked.has(s.id)}
                onChange={(e) => {
                  const on = e.currentTarget.checked
                  setPicked((cur) => {
                    const next = new Set(cur)
                    if (on) next.add(s.id)
                    else next.delete(s.id)
                    return next
                  })
                }}
                label={
                  <span>
                    {s.label} <span className="text-muted-foreground">({s.from === 'starred' ? 'starred' : `used by ${s.from}`})</span>
                  </span>
                }
              />
            ))}
            <Button type="button" size="sm" disabled={pending || picked.size === 0} onClick={add}>
              Add to release list
            </Button>
          </div>
        )
      ) : null}
    </div>
  )
}
