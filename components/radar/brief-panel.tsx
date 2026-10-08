'use client'
import { plural } from '@/lib/ui/labels'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GraduationCap, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { UsageBadge } from '@/components/ai/usage-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { confirmBriefAction, draftBriefAction, learnThisAction } from '@/app/(authed)/radar/actions'
import type { AiUsage } from '@/lib/ai/usage-types'
import type { BriefDraft, BriefModule, BriefSections, BriefSource } from '@/lib/radar/brief/types'
import { shortDay } from '@/lib/ui/date'
import { BriefSectionsView } from './brief-sections'

interface SavedBrief {
  sections: BriefSections
  sources: BriefSource[]
  module: BriefModule | null
  savedAt: string
}

interface BriefPanelProps {
  entryId: string
  /** Primary-source candidates among the entry's items (the gate needs 2 fetched). */
  primarySources: number
  saved: SavedBrief | null
}

/**
 * Grounded brief: drafted on demand, shown as a draft the user trims and
 * confirms; then "Learn this" adds it to the Playground's reviews.
 */
export function BriefPanel({ entryId, primarySources, saved }: BriefPanelProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<BriefDraft | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [skipped, setSkipped] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const generate = (): void => {
    start(async () => {
      const r = await draftBriefAction(entryId)
      if ('error' in r) return void toast.error(r.error)
      if ('skipped' in r) return void setSkipped(r.message)
      setSkipped(null)
      setRemoved(new Set())
      setDraft(r.draft)
      setUsage(r.usage)
    })
  }

  const confirm = (): void => {
    if (!draft) return
    const removals = [...removed].map((k) => {
      const [section, index] = k.split(':')
      return { section, index: Number(index) }
    })
    start(async () => {
      const r = await confirmBriefAction(draft, removals)
      if ('error' in r) return void toast.error(r.error)
      toast.success(r.message ?? 'Saved.')
      setDraft(null)
      router.refresh()
    })
  }

  const learn = (): void => {
    start(async () => {
      const r = await learnThisAction(entryId)
      if ('error' in r) return void toast.error(r.error)
      toast.success(`Added ${plural(r.module.cards.length, 'card')} to your Playground reviews.`)
      router.refresh()
    })
  }

  const toggle = (key: string): void => {
    setRemoved((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Card data-testid="radar-brief">
      <CardHeader>
        <CardTitle className="text-base">Brief</CardTitle>
        <CardDescription>
          Written only from at least two fetched primary sources (official post, README, model card, paper). Every sentence quotes
          its source word for word or is dropped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft ? (
          <>
            <p className="text-xs text-muted-foreground">
              Draft — not saved. Untick sentences you don&apos;t want, then confirm.
              {draft.dropped > 0 ? ` ${plural(draft.dropped, 'sentence')} failed the citation check and were dropped.` : ''}
            </p>
            <UsageBadge usage={usage} />
            <BriefSectionsView sections={draft.sections} sources={draft.sources} removed={removed} onToggle={toggle} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={confirm} disabled={pending}>
                Confirm and save
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)} disabled={pending}>
                Discard
              </Button>
            </div>
          </>
        ) : saved ? (
          <>
            <BriefSectionsView sections={saved.sections} sources={saved.sources} />
            <p className="text-xs text-muted-foreground">Confirmed by you on {shortDay(saved.savedAt)}.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={learn} disabled={pending}>
                <GraduationCap />
                {saved.module ? 'Add cards again' : 'Learn this'}
              </Button>
              {saved.module ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/playground/review">Review cards</Link>
                </Button>
              ) : null}
              {saved.module?.lab ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={saved.module.lab.href}>{saved.module.lab.label}</Link>
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={generate} disabled={pending}>
                Regenerate
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {skipped || primarySources < 2 ? (
              <p className="text-sm text-muted-foreground" data-testid="brief-not-enough">
                {skipped ?? `Not enough sources for a brief yet: ${primarySources} of 2 primary sources.`}
              </p>
            ) : null}
            <Button type="button" size="sm" onClick={generate} disabled={pending || primarySources < 2}>
              <Sparkles />
              {pending ? 'Fetching sources…' : 'Generate brief'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
