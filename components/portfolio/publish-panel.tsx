'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { publishAction, resolveConflictAction } from '@/app/(authed)/settings/profile/publish/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Choices, DiffSection, SectionDiff, Side } from '@/lib/portfolio/diff'
import type { PublishOutcome } from '@/lib/portfolio/publish'

interface PublishPanelProps {
  ready: boolean
  /** "Published Sep 27" etc., computed on the server. */
  status: string | null
  commitUrl: string | null
}

type Conflict = Extract<PublishOutcome, { status: 'conflict' }>

const REASONS: Readonly<Record<Conflict['reason'], string>> = {
  edited: 'profile.json was edited outside lee since lee last wrote it.',
  deleted: 'profile.json was deleted from the repository.',
  changed_during_publish: 'profile.json changed on GitHub while lee was publishing.',
  unreadable: 'profile.json in the repository is not valid JSON.',
}

function show(v: unknown): string {
  if (v === undefined) return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 160 ? `${s.slice(0, 157)}…` : s
}

function ConflictPanel({ conflict, onDone }: { conflict: Conflict; onDone: (o: PublishOutcome) => void }) {
  const repoAvailable = conflict.reason === 'edited' || conflict.reason === 'changed_during_publish'
  const [choices, setChoices] = useState<Choices>(() => Object.fromEntries(conflict.diff.map((d) => [d.section, 'lee'])) as Choices)
  const [pending, start] = useTransition()
  const all = (side: Side): void => setChoices(Object.fromEntries(conflict.diff.map((d) => [d.section, side])) as Choices)
  const submit = (): void =>
    start(async () => {
      const r = await resolveConflictAction({ repoSha: conflict.repoSha, choices })
      if ('error' in r) toast.error(r.error)
      else onDone(r.outcome)
    })
  return (
    <section aria-label="Changes in the repository" className="space-y-3 rounded-md border border-warning/40 p-3">
      <p className="text-sm font-medium text-warning">{REASONS[conflict.reason]} Nothing was overwritten. Choose per section:</p>
      {repoAvailable ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => all('repo')}>
            Take all from repo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => all('lee')}>
            Keep all from lee
          </Button>
        </div>
      ) : null}
      {conflict.diff.map((d: SectionDiff) => (
        <fieldset key={d.section} className="space-y-2 rounded-md border p-2">
          <legend className="px-1 text-sm font-medium">{d.label}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['lee', 'repo'] as const).map((side) => (
              <label key={side} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`side-${d.section}`}
                  value={side}
                  disabled={side === 'repo' && !repoAvailable}
                  checked={choices[d.section as DiffSection] === side}
                  onChange={() => setChoices({ ...choices, [d.section]: side })}
                />
                {side === 'lee' ? 'Keep lee’s' : 'Take the repo’s'}
              </label>
            ))}
          </div>
          <ul className="space-y-1 text-xs">
            {d.changes.slice(0, 12).map((c) => (
              <li key={c.path} className="grid gap-0.5 sm:grid-cols-[minmax(0,10rem)_1fr_1fr] sm:gap-2">
                <code className="break-all text-muted-foreground">{c.path}</code>
                <span className="break-words"><span className="text-muted-foreground">repo:</span> {show(c.repo)}</span>
                <span className="break-words"><span className="text-muted-foreground">lee:</span> {show(c.lee)}</span>
              </li>
            ))}
            {d.changes.length > 12 ? <li className="text-muted-foreground">…and {d.changes.length - 12} more</li> : null}
          </ul>
        </fieldset>
      ))}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />} Publish with these choices
      </Button>
    </section>
  )
}

export function PublishPanel({ ready, status, commitUrl }: PublishPanelProps) {
  const router = useRouter()
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, start] = useTransition()

  const handle = (o: PublishOutcome): void => {
    setConflict(null)
    setErrors([])
    if (o.status === 'published') toast.success(`Published ${o.version}`)
    else if (o.status === 'up_to_date') toast.success('Already up to date')
    else if (o.status === 'conflict') setConflict(o)
    else if (o.status === 'invalid') {
      setErrors(o.errors)
      toast.error('The portfolio build would reject this file')
    } else toast.error(o.error)
    router.refresh()
  }

  const publish = (): void =>
    start(async () => {
      const r = await publishAction()
      if ('error' in r) toast.error(r.error)
      else handle(r.outcome)
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish</CardTitle>
        <CardDescription>
          Commits the public fields of your profile as profile.json (“chore(profile): sync from lee”). If the file was edited on GitHub, you choose what to keep first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={publish} disabled={pending || !ready}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} Publish
          </Button>
          {status ? (
            <span className="text-sm text-muted-foreground" data-testid="publish-status">
              {status}
              {commitUrl ? (
                <>
                  {' · '}
                  <a href={commitUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    view commit
                  </a>
                </>
              ) : null}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{ready ? 'Not published yet.' : 'Set the repository and token first.'}</span>
          )}
        </div>
        {errors.length > 0 ? (
          <ul role="alert" className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
            {errors.map((e) => (
              <li key={e} className="break-words">{e}</li>
            ))}
          </ul>
        ) : null}
        {conflict ? <ConflictPanel conflict={conflict} onDone={handle} /> : null}
      </CardContent>
    </Card>
  )
}
