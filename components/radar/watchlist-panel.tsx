'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormActions, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  addWatchTermAction,
  editWatchTermAction,
  muteWatchTermAction,
  removeWatchTermAction,
  type RadarActionResult,
} from '@/app/(authed)/radar/actions'
import type { WatchSuggestion } from '@/lib/radar/suggest'

export interface WatchTermView {
  id: string
  term: string
  aliases: string[]
  kind: 'term' | 'entity'
  muted: boolean
}

function TermForm({
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idPrefix: string
  initial?: WatchTermView
  submitLabel: string
  onSubmit: (fd: FormData) => Promise<boolean>
  onCancel?: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  return (
    <form
      ref={formRef}
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          if ((await onSubmit(fd)) && !initial) formRef.current?.reset()
        })
      }}
    >
      <FormField htmlFor={`${idPrefix}-term`} label="Term or name">
        <Input id={`${idPrefix}-term`} name="term" required minLength={2} maxLength={80} defaultValue={initial?.term} placeholder="A model, product or topic" />
      </FormField>
      <FormField htmlFor={`${idPrefix}-aliases`} label="Aliases" hint="(comma-separated, optional)">
        <Input id={`${idPrefix}-aliases`} name="aliases" maxLength={400} defaultValue={initial?.aliases.join(', ')} placeholder="Other spellings" />
      </FormField>
      <FormField htmlFor={`${idPrefix}-kind`} label="Kind">
        <NativeSelect id={`${idPrefix}-kind`} name="kind" defaultValue={initial?.kind ?? 'term'}>
          <option value="term">Term</option>
          <option value="entity">Product / model</option>
        </NativeSelect>
      </FormField>
      <FormActions>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {initial ? null : <Plus />}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </FormActions>
    </form>
  )
}

export function WatchlistPanel({ terms, suggestions }: { terms: WatchTermView[]; suggestions: WatchSuggestion[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const report = (r: RadarActionResult): boolean => {
    if ('error' in r) {
      toast.error(r.error)
      return false
    }
    if (r.message) toast.success(r.message)
    router.refresh()
    return true
  }

  const run = (fn: () => Promise<RadarActionResult>): void => {
    start(async () => {
      report(await fn())
    })
  }

  const addSuggestion = (term: string): void => {
    const fd = new FormData()
    fd.set('term', term)
    run(() => addWatchTermAction(fd))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a watch term</CardTitle>
          <CardDescription>Matching is case-insensitive on whole words; aliases count as the same term.</CardDescription>
        </CardHeader>
        <CardContent>
          <TermForm idPrefix="new" submitLabel="Watch" onSubmit={async (fd) => report(await addWatchTermAction(fd))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Watching ({terms.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No terms yet.</p>
          ) : (
            <ul className="divide-y rounded-md border" aria-label="Watch terms">
              {terms.map((t) => (
                <li key={t.id} className="space-y-3 px-3 py-2.5" data-testid="watch-term">
                  {editing === t.id ? (
                    <TermForm
                      idPrefix={`edit-${t.id}`}
                      initial={t}
                      submitLabel="Save"
                      onCancel={() => setEditing(null)}
                      onSubmit={async (fd) => {
                        const ok = report(await editWatchTermAction(t.id, fd))
                        if (ok) setEditing(null)
                        return ok
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="break-words font-medium">{t.term}</span>
                        {t.aliases.length > 0 ? (
                          <span className="ml-2 break-words text-xs text-muted-foreground">also {t.aliases.join(', ')}</span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {t.kind === 'entity' ? <Badge variant="neutral">Product / model</Badge> : null}
                        {t.muted ? <Badge variant="warning">Muted</Badge> : null}
                        <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${t.term}`} onClick={() => setEditing(t.id)} disabled={pending}>
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t.muted ? `Unmute ${t.term}` : `Mute ${t.term}`}
                          onClick={() => run(() => muteWatchTermAction(t.id, !t.muted))}
                          disabled={pending}
                        >
                          {t.muted ? <Bell /> : <BellOff />}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${t.term}`}
                          onClick={() => run(() => removeWatchTermAction(t.id))}
                          disabled={pending}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested</CardTitle>
            <CardDescription>
              From your interview-ready CV skills and your Playground study targets. Nothing is added until you click.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s.term}>
                  <Button type="button" size="sm" variant="outline" onClick={() => addSuggestion(s.term)} disabled={pending}>
                    <Plus />
                    {s.term}
                    <span className="text-muted-foreground">· {s.reason === 'cv' ? 'CV' : 'Playground'}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
