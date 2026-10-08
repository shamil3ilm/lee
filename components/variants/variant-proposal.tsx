'use client'
import { plural } from '@/lib/ui/labels'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { acceptProposalAction, proposeVariantAction } from '@/app/(authed)/settings/variants/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FilteredProposal } from '@/lib/variants/proposals'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * AI suggests, the user confirms. The proposal arrives already filtered
 * (interview-ready items only, fact-locked wordings); the user ticks what
 * to keep, and only that is saved (as a new variant version).
 */
export function VariantProposal({ variantId, dirty }: { variantId: string; dirty: boolean }) {
  const router = useRouter()
  const [proposal, setProposal] = useState<FilteredProposal | null>(null)
  const [keep, setKeep] = useState({ headline: true, summary: true, selection: true })
  const [wordings, setWordings] = useState<Set<number>>(new Set())
  const [pending, start] = useTransition()

  const ask = (): void =>
    start(async () => {
      const r = await proposeVariantAction(variantId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setProposal(r.proposal)
      setWordings(new Set(r.proposal.wordings.map((_, i) => i)))
    })

  const accept = (): void =>
    start(async () => {
      if (!proposal) return
      const r = await acceptProposalAction(variantId, {
        headline: keep.headline && proposal.headline ? proposal.headline : null,
        summary: keep.summary && proposal.summary ? proposal.summary : null,
        selectedIds: keep.selection ? proposal.selectedIds : null,
        wordings: proposal.wordings.filter((_, i) => wordings.has(i)),
      })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Saved as version ${r.version}`)
      setProposal(null)
      router.refresh()
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI suggestions</CardTitle>
        <CardDescription>A headline, summary, selection and sharper wordings — from interview-ready items only. Nothing changes until you accept.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!proposal ? (
          <Button type="button" size="sm" variant="outline" onClick={ask} disabled={pending || dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest
          </Button>
        ) : (
          <div className="space-y-3 text-sm">
            {proposal.headline ? (
              <label className="flex items-start gap-2">
                <Checkbox className="mt-1" checked={keep.headline} onChange={(e) => setKeep({ ...keep, headline: e.target.checked })} />
                <span className="min-w-0 break-words"><span className="font-medium">Headline:</span> {proposal.headline}</span>
              </label>
            ) : null}
            {proposal.summary ? (
              <label className="flex items-start gap-2">
                <Checkbox className="mt-1" checked={keep.summary} onChange={(e) => setKeep({ ...keep, summary: e.target.checked })} />
                <span className="min-w-0 break-words"><span className="font-medium">Summary:</span> {proposal.summary}</span>
              </label>
            ) : null}
            <label className="flex items-start gap-2">
              <Checkbox className="mt-1" checked={keep.selection} onChange={(e) => setKeep({ ...keep, selection: e.target.checked })} />
              <span>Use the suggested selection ({plural(proposal.selectedIds.length, 'item')})</span>
            </label>
            {proposal.wordings.map((w, i) => (
              <label key={i} className="flex items-start gap-2">
                <Checkbox
                  className="mt-1"
                  checked={wordings.has(i)}
                  onChange={(e) => {
                    const next = new Set(wordings)
                    if (e.target.checked) next.add(i)
                    else next.delete(i)
                    setWordings(next)
                  }}
                />
                <span className="min-w-0 break-words"><span className="font-medium">Wording:</span> {w.text}</span>
              </label>
            ))}
            {proposal.flags.length > 0 || proposal.rejected.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {proposal.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {proposal.rejected.map((r, i) => (
                  <li key={i}>
                    Dropped {r.what}: {r.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={accept} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Accept selected
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)} disabled={pending}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
