'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UsageBadge } from '@/components/ai/usage-badge'
import {
  clearReputationSummaryAction,
  confirmReputationSummaryAction,
  draftReputationSummaryAction,
} from '@/app/(authed)/companies/[id]/reputation-actions'
import type { AiUsage } from '@/lib/ai/usage-types'
import { RED_FLAG_LABELS, type Claim, type ConfirmedSummary, type SummaryDraft } from '@/lib/reputation/types'
import { SummaryEditor } from './summary-editor'

interface Props {
  companyId: string
  summary: ConfirmedSummary | null
  citations: Record<string, string>
}

const US_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function CiteLinks({ cites, citations }: { cites: string[]; citations: Record<string, string> }) {
  return (
    <span className="ml-1 text-xs text-muted-foreground">
      {cites.map((id, i) => (
        <a key={id} href={`#signal-${id}`} title={citations[id] ?? id} className="hover:underline">
          [{i + 1}]
        </a>
      ))}
    </span>
  )
}

function ClaimList({ title, items, citations }: { title: string; items: Claim[]; citations: Record<string, string> }) {
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((c, i) => (
          <li key={i}>
            {c.text}
            <CiteLinks cites={c.cites} citations={citations} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ConfirmedView({ summary, citations }: { summary: ConfirmedSummary; citations: Record<string, string> }) {
  return (
    <div className="space-y-3">
      {summary.redFlags.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-danger">Red flags</h4>
          <ul className="mt-1 space-y-1.5 text-sm">
            {summary.redFlags.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{RED_FLAG_LABELS[f.category]}:</span> {f.text}
                <CiteLinks cites={f.cites} citations={citations} />
                {f.gccRelevance ? <div className="text-xs text-muted-foreground">GCC: {f.gccRelevance}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ClaimList title="Cons" items={summary.cons} citations={citations} />
      <ClaimList title="Pros" items={summary.pros} citations={citations} />
      {summary.gccNote ? <p className="text-sm"><span className="font-medium">GCC note:</span> {summary.gccNote}</p> : null}
      <p className="text-xs text-muted-foreground">Confirmed by you on {US_DAY.format(new Date(summary.confirmedAt))}.</p>
    </div>
  )
}

/**
 * AI summary: drafted only when asked, editable, saved only on Confirm.
 * Every claim keeps its sources; a claim without one cannot be confirmed.
 */
export function ReputationSummary({ companyId, summary, citations }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<SummaryDraft | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [pending, start] = useTransition()

  const generate = (): void => {
    start(async () => {
      const r = await draftReputationSummaryAction(companyId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setDraft(r.draft)
      setUsage(r.usage)
      if (r.draft.pros.length + r.draft.cons.length + r.draft.redFlags.length === 0) {
        toast.message('The AI found nothing it could cite. Add claims yourself or record a rating.')
      }
    })
  }

  const confirm = (): void => {
    if (!draft) return
    start(async () => {
      const r = await confirmReputationSummaryAction(companyId, draft)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Saved.')
      setDraft(null)
      router.refresh()
    })
  }

  const clear = (): void => {
    start(async () => {
      const r = await clearReputationSummaryAction(companyId)
      if ('error' in r) toast.error(r.error)
      else router.refresh()
    })
  }

  if (draft) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Draft — not saved. Edit anything, keep a source on every claim, then confirm.
        </p>
        <UsageBadge usage={usage} />
        <SummaryEditor draft={draft} citations={citations} onChange={setDraft} />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={confirm} disabled={pending}>
            Confirm and save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)} disabled={pending}>
            Discard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {summary ? (
        <ConfirmedView summary={summary} citations={citations} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No summary yet. Draft one from the signals and your ratings — nothing is saved until you confirm it.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={generate} disabled={pending}>
          <Sparkles /> {pending ? 'Drafting…' : summary ? 'Redraft with AI' : 'Draft with AI'}
        </Button>
        {summary ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft({ pros: summary.pros, cons: summary.cons, redFlags: summary.redFlags, gccNote: summary.gccNote })}
              disabled={pending}
            >
              Edit
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={pending}>
              Remove
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
