'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Loader2, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { previewTailorAction, saveTailoredCopyAction } from '@/app/(authed)/cv-fit-actions'
import type { TailorView } from '@/lib/cv-fit/tailor/service'
import type { GapDecision, Suggestion, TailorOutcome } from '@/lib/cv-fit/tailor/types'
import { BeforeAfter } from './before-after'
import { GapList } from './gap-list'
import { RequirementChecklist } from './requirement-checklist'
import { SuggestionList } from './suggestion-list'

interface WordingsResponse {
  suggestions?: Suggestion[]
  rejected?: Array<{ text: string; reason: string }>
  skipped?: boolean
  message?: string
  fixHint?: string
  error?: string
}

function toggled(set: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
}

/**
 * "Tailor to this JD": the requirement checklist, every suggested change
 * (each accepted on its own), the gaps, the before / after, and Save as a
 * tailored copy. Nothing changes until Save; the deterministic part works
 * without an AI key, and new wordings are an optional extra.
 */
export function TailorPanel({ view }: { view: TailorView }) {
  const router = useRouter()
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set())
  const [aiWordings, setAiWordings] = useState<Suggestion[]>([])
  const [cover, setCover] = useState<ReadonlySet<string>>(new Set())
  const [studied, setStudied] = useState<ReadonlySet<string>>(new Set())
  const [outcome, setOutcome] = useState<TailorOutcome | null>(null)
  const [pending, start] = useTransition()
  const [aiPending, startAi] = useTransition()
  const suggestions = [...view.suggestions, ...aiWordings]
  const wordings = aiWordings
    .filter((s) => accepted.has(s.id))
    .flatMap((s) => (s.kind === 'ai_wording' ? [{ highlightId: s.highlightId, text: s.text }] : []))
  const payload = { accepted: [...accepted], wordings }

  const onToggle = (id: string, on: boolean): void => {
    setAccepted((prev) => toggled(prev, id, on))
    setOutcome(null)
  }

  const preview = (): void =>
    start(async () => {
      const r = await previewTailorAction(view.applicationId, payload)
      if ('error' in r) toast.error(r.error)
      else setOutcome(r.outcome)
    })

  const save = (): void =>
    start(async () => {
      const gaps: GapDecision[] = view.gaps.map((g) => ({
        requirementId: g.requirementId,
        action: cover.has(g.requirementId) ? 'cover' : studied.has(g.requirementId) ? 'study' : 'ignore',
      }))
      const r = await saveTailoredCopyAction(view.applicationId, { ...payload, gaps })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Saved the tailored copy (v${r.version}). It is in Documents.`)
      router.refresh()
    })

  const suggestWordings = (): void =>
    startAi(async () => {
      try {
        const res = await fetch(`/api/applications/${view.applicationId}/tailor/wordings`, { method: 'POST' })
        const data = (await res.json().catch(() => ({}))) as WordingsResponse
        if (data.skipped) return void toast.error([data.message, data.fixHint].filter(Boolean).join(' '))
        if (!res.ok || data.error) return void toast.error(data.error ?? 'Could not suggest new wordings.')
        const fresh = (data.suggestions ?? []).filter((s) => !aiWordings.some((a) => a.id === s.id))
        setAiWordings((prev) => [...prev, ...fresh])
        const dropped = data.rejected?.length ?? 0
        toast.success(`${fresh.length} new wording${fresh.length === 1 ? '' : 's'} to review${dropped ? `; ${dropped} refused by the fact lock` : ''}.`)
      } catch {
        toast.error('Could not suggest new wordings.')
      }
    })

  const deterministic = view.suggestions.map((s) => s.id)
  return (
    <div className="space-y-5" data-testid="tailor-panel">
      <p className="text-xs text-muted-foreground">
        Starting from <span className="font-medium text-foreground">{view.base.name}</span>
        {view.base.version ? ` v${view.base.version}` : ''}. Every change only picks, orders or re-words what your profile already holds.
        {view.saved ? (
          <>
            {' '}
            Last saved copy:{' '}
            <Link href={`/documents/${view.saved.documentId}`} className="font-medium text-primary underline underline-offset-2">
              open it
            </Link>
            .
          </>
        ) : null}
      </p>

      <section className="space-y-2">
        <Heading>Requirements</Heading>
        <RequirementChecklist items={view.checklist} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading>Suggested changes</Heading>
          <div className="flex flex-wrap gap-2">
            {deterministic.length > 0 ? (
              <Button size="sm" variant="ghost" className="h-8" disabled={pending} onClick={() => setAccepted(new Set(suggestions.map((s) => s.id)))}>
                Accept all
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8" disabled={aiPending} onClick={suggestWordings}>
              {aiPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Suggest new wordings
            </Button>
          </div>
        </div>
        <SuggestionList suggestions={suggestions} accepted={accepted} onToggle={onToggle} disabled={pending} />
      </section>

      <section className="space-y-2">
        <Heading>Gaps</Heading>
        <GapList
          applicationId={view.applicationId}
          gaps={view.gaps}
          cover={cover}
          studied={studied}
          onCover={(id, on) => setCover((prev) => toggled(prev, id, on))}
          onStudied={(id) => setStudied((prev) => toggled(prev, id, true))}
          disabled={pending}
        />
      </section>

      <section className="space-y-2">
        <Heading>Before and after</Heading>
        {outcome ? <BeforeAfter outcome={outcome} /> : <p className="text-xs text-muted-foreground">Preview to compare coverage, CV Score and every changed line.</p>}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={preview}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          Preview before / after
        </Button>
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save tailored copy
        </Button>
      </div>
    </div>
  )
}
