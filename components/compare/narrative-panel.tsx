'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { clearNarrativeAction, confirmNarrativeAction, draftNarrativeAction } from '@/app/(authed)/compare/actions'
import type { NarrativeDraft, SavedNarrative } from '@/lib/compare/narrative'

type Claim = NarrativeDraft['summary'][number]

interface NarrativePanelProps {
  opportunityKey: string
  saved: SavedNarrative | null
  /** Citation id → the fact's text, to show under each sentence. */
  citations: Record<string, string>
}

function Cites({ ids, citations }: { ids: readonly string[]; citations: Record<string, string> }) {
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {ids.map((id) => (
        <li key={id}>Source: {citations[id] ?? id}</li>
      ))}
    </ul>
  )
}

function ClaimEditor({ claims, onChange, citations, label }: { claims: Claim[]; onChange: (c: Claim[]) => void; citations: Record<string, string>; label: string }) {
  return (
    <ol className="space-y-3">
      {claims.map((c, i) => (
        <li key={i} className="space-y-1">
          <div className="flex items-start gap-2">
            <Textarea
              aria-label={`${label} ${i + 1}`}
              rows={2}
              maxLength={300}
              value={c.text}
              onChange={(e) => onChange(claims.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            />
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(claims.filter((_, j) => j !== i))}>
              <X className="size-4" />
            </Button>
          </div>
          <Cites ids={c.cites} citations={citations} />
        </li>
      ))}
    </ol>
  )
}

/** Optional AI narrative: drafted on demand, edited, then confirmed by the user. */
export function NarrativePanel({ opportunityKey, saved, citations }: NarrativePanelProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<NarrativeDraft | null>(null)
  const [pending, start] = useTransition()

  const generate = (): void =>
    start(async () => {
      const r = await draftNarrativeAction(opportunityKey)
      if ('error' in r) toast.error(r.error)
      else if ('skipped' in r) toast(r.message, { description: r.fixHint })
      else if (r.draft.summary.length === 0 && r.draft.questions.length === 0) toast('Nothing the AI wrote could be tied to a source, so it was dropped.')
      else setDraft(r.draft)
    })

  const confirm = (): void =>
    start(async () => {
      if (!draft) return
      const clean = { summary: draft.summary.filter((c) => c.text.trim()), questions: draft.questions.filter((c) => c.text.trim()) }
      const r = await confirmNarrativeAction(opportunityKey, clean)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message)
        setDraft(null)
        router.refresh()
      }
    })

  const clear = (): void =>
    start(async () => {
      const r = await clearNarrativeAction(opportunityKey)
      if ('error' in r) toast.error(r.error)
      else router.refresh()
    })

  return (
    <section aria-labelledby={`narrative-${opportunityKey}`} className="space-y-3 rounded-lg border p-3" data-testid="compare-narrative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`narrative-${opportunityKey}`} className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" aria-hidden="true" />
          AI narrative <span className="font-normal text-muted-foreground">(optional)</span>
        </h3>
        {!draft ? (
          <Button type="button" size="sm" variant="outline" onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {saved ? 'Draft again' : 'Draft narrative'}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Uses only the facts above, cites each one and never adds figures. Your current salary is not sent. Nothing is saved until you
        confirm.
      </p>
      {draft ? (
        <div className="space-y-4">
          <ClaimEditor claims={draft.summary} citations={citations} label="Sentence" onChange={(summary) => setDraft({ ...draft, summary })} />
          {draft.questions.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested questions</h4>
              <ClaimEditor claims={draft.questions} citations={citations} label="Question" onChange={(questions) => setDraft({ ...draft, questions })} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={confirm} disabled={pending}>
              Save narrative
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Discard
            </Button>
          </div>
        </div>
      ) : saved ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {saved.summary.map((c, i) => (
              <li key={i} className="text-sm">
                {c.text}
                <Cites ids={c.cites} citations={citations} />
              </li>
            ))}
          </ul>
          {saved.questions.length > 0 ? (
            <ul className="list-inside list-disc text-sm">
              {saved.questions.map((q, i) => (
                <li key={i}>{q.text}</li>
              ))}
            </ul>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={pending}>
            <Trash2 className="size-4" />
            Remove narrative
          </Button>
        </div>
      ) : null}
    </section>
  )
}
