'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { setReleaseProjectsAction } from '@/app/(authed)/radar/new/actions'
import { MAX_USER_PROJECTS, RELEASE_PROJECTS } from '@/lib/radar/new/projects'

interface ReleaseProjectsPanelProps {
  selected: string[]
  derived: boolean
}

/** Radar › Sources: which projects' new releases What's new follows. */
export function ReleaseProjectsPanel({ selected, derived }: ReleaseProjectsPanelProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [chosen, setChosen] = useState<string[]>(selected)

  const toggle = (id: string, on: boolean): void => {
    setChosen((cur) => (on ? [...cur, id].slice(0, MAX_USER_PROJECTS) : cur.filter((x) => x !== id)))
  }

  const save = (ids: string[] | null): void => {
    start(async () => {
      const r = await setReleaseProjectsAction(ids)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? 'Saved.')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {derived ? 'Picked from your ready skills, study list and role families. ' : 'Your own list. '}
        Up to {MAX_USER_PROJECTS}. New release cycles come from endoflife.date (with end-of-life dates); minor releases from the project&apos;s GitHub
        releases.
      </p>
      <fieldset>
        <legend className="sr-only">Release projects</legend>
        <ul className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {RELEASE_PROJECTS.map((p) => (
            <li key={p.id}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={chosen.includes(p.id)}
                  disabled={pending}
                  onChange={(e) => toggle(p.id, e.currentTarget.checked)}
                />
                {p.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => save(chosen)}>
          Save release list
        </Button>
        {derived ? null : (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(null)}>
            Use my profile again
          </Button>
        )}
      </div>
    </div>
  )
}
