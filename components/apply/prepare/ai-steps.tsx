'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { skipStepAction } from '@/app/(authed)/shortlist/actions'
import type { PrepareView } from '@/lib/apply/prepare-view'
import { scoreDelta } from '@/lib/apply/progress'
import { StepShell, toResult, useStepAction, type StepState } from './step-shell'
import { Checkbox } from '@/components/ui/checkbox'
import { TailorPanel } from '@/components/cv-fit/tailor/tailor-panel'

interface StepResponse {
  documentId?: string
  skipped?: boolean
  message?: string
  fixHint?: string
  error?: string
}

/** POST a Prepare AI step; a signal-gating skip becomes a readable error with its fix hint. */
async function postStep(url: string, body?: unknown): Promise<{ error?: string; ok?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = (await res.json().catch(() => ({}))) as StepResponse
  if (data.skipped) return { error: [data.message, data.fixHint].filter(Boolean).join(' ') || 'Skipped by the AI budget checks.' }
  if (!res.ok || data.error) return { error: data.error ?? 'Could not finish this step.' }
  return { ok: 'Draft ready. Review it before you use it.' }
}

function DocLink({ view, id }: { view: PrepareView; id: string | undefined }) {
  const doc = id ? view.documents[id] : undefined
  if (!id || !doc) return null
  return (
    <Link href={`/documents/${id}`} className="font-medium text-primary underline-offset-2 hover:underline">
      {doc.title} (v{doc.version})
    </Link>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

export function TailorStep({ view, state }: { view: PrepareView; state: StepState }) {
  const [pending, run] = useStepAction()
  const t = view.progress.tailor
  const delta = scoreDelta(view.progress)
  const summary =
    state === 'done' && t ? (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <DocLink view={view} id={t.documentId} />
        {t.documentId ? (
          <a href={`/api/documents/${t.documentId}/docx`} download className="text-primary underline-offset-2 hover:underline" data-testid="tailored-docx">
            Download .docx
          </a>
        ) : null}
        {typeof t.scoreBefore === 'number' && typeof t.scoreAfter === 'number' ? (
          <span data-testid="cv-score-delta">
            CV Score {t.scoreBefore} → {t.scoreAfter}
            {delta !== null ? <span className="ml-1 font-medium text-foreground tabular-nums">({signed(delta)} vs the variant)</span> : null}
          </span>
        ) : null}
      </span>
    ) : state === 'skipped' ? (
      'Skipped.'
    ) : (
      'Tailor the chosen résumé to this posting: accept the changes you want and save a tailored copy. Facts stay locked to your profile.'
    )
  return (
    <StepShell n={2} title="Tailored CV" state={state} summary={summary} testId="prepare-step-tailor">
      {view.tailor && state !== 'skipped' ? <TailorPanel view={view.tailor} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {view.tailor ? <span className="text-xs text-muted-foreground">Or draft a full rewrite:</span> : null}
        <Button
          size="sm"
          variant={state === 'current' ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => run(() => postStep(`/api/applications/${view.applicationId}/prepare/tailor`))}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {state === 'done' ? 'Tailor again' : 'Generate tailored CV'}
        </Button>
        {state === 'current' ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipStepAction(view.applicationId, 'tailor').then(toResult))}>
            Skip
          </Button>
        ) : null}
      </div>
    </StepShell>
  )
}

export function CoverStep({ view, state }: { view: PrepareView; state: StepState }) {
  const [pending, run] = useStepAction()
  const saved = view.progress.cover?.linkIds
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    new Set(saved ?? view.links.filter((l) => l.suggested).map((l) => l.id)),
  )
  const toggle = (id: string, on: boolean): void =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const summary =
    state === 'done' ? <DocLink view={view} id={view.progress.cover?.documentId} /> : state === 'skipped' ? 'Skipped.' : 'A first draft from your profile and this posting.'

  return (
    <StepShell n={3} title="Cover letter" state={state} summary={summary} testId="prepare-step-cover">
      {view.links.length > 0 ? (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Links to include</legend>
          {view.links.map((l) => (
            <label key={l.id} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={ticked.has(l.id)}
                onChange={(e) => toggle(l.id, e.target.checked)}
                disabled={pending}
              />
              <span className="min-w-0">
                <span className="font-medium">{l.label}</span>
                {l.reason ? <span className="block text-xs text-muted-foreground">{l.reason}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-xs text-muted-foreground">
          No profile links yet. <Link href="/settings/profile#profile-links" className="text-primary underline underline-offset-2">Add some</Link> to share them in drafts.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={state === 'current' ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => run(() => postStep(`/api/applications/${view.applicationId}/prepare/cover`, { linkIds: [...ticked] }))}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {state === 'done' ? 'Draft again' : 'Generate cover letter'}
        </Button>
        {state === 'current' ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipStepAction(view.applicationId, 'cover').then(toResult))}>
            Skip
          </Button>
        ) : null}
      </div>
    </StepShell>
  )
}
