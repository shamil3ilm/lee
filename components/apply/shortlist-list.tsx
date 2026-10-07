'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortlistCard, type ShortlistCardItem } from '@/components/apply/shortlist-card'
import { MAX_BATCH } from '@/lib/apply/batch-limits'

interface BatchItem {
  discoveryId: string
  applicationId: string | null
  status: 'prepared' | 'partial' | 'failed'
  message: string | null
}

const STATUS_TEXT: Record<BatchItem['status'], string> = {
  prepared: 'Ready to review',
  partial: 'Partly prepared',
  failed: 'Not prepared',
}

/**
 * Today's open shortlist entries with batch selection: "Prepare selected"
 * runs the variant, tailored CV and cover letter steps for up to three
 * postings (the AI budget permitting). Nothing is sent or submitted.
 */
export function ShortlistList({ items }: { items: ShortlistCardItem[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [results, setResults] = useState<BatchItem[] | null>(null)
  const [running, startTransition] = useTransition()
  const titleOf = new Map(items.map((i) => [i.discoveryId, i.title] as const))

  const toggle = (id: string, on: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const tooMany = selected.size > MAX_BATCH

  const runBatch = (): void =>
    startTransition(async () => {
      try {
        const res = await fetch('/api/apply/prepare-batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ discoveryIds: [...selected] }),
        })
        const body = (await res.json().catch(() => null)) as { items?: BatchItem[]; error?: string } | null
        if (!res.ok || !body?.items) {
          toast.error(body?.error ?? 'Could not prepare these applications.')
          return
        }
        setResults(body.items)
        setSelected(new Set())
        const ready = body.items.filter((i) => i.status === 'prepared').length
        toast.success(`${ready} of ${body.items.length} prepared. Review each before you apply.`)
        router.refresh()
      } catch {
        toast.error('Could not prepare these applications.')
      }
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Batch prepare">
        <Button size="sm" variant="outline" onClick={runBatch} disabled={running || selected.size === 0 || tooMany}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
          Prepare selected ({selected.size})
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {tooMany
            ? `Pick at most ${MAX_BATCH} at a time.`
            : running
              ? 'Preparing: variant, tailored CV and cover letter for each…'
              : `Select up to ${MAX_BATCH} to prepare in one go.`}
        </span>
      </div>

      {results ? (
        <ul className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm" aria-label="Batch results">
          {results.map((r) => (
            <li key={r.discoveryId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{titleOf.get(r.discoveryId) ?? 'Posting'}</span>
              <span className="text-xs text-muted-foreground">
                {STATUS_TEXT[r.status]}
                {r.message ? ` · ${r.message}` : ''}
              </span>
              {r.applicationId ? (
                <Link
                  href={`/applications/${r.applicationId}/prepare`}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Review
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <ol className="space-y-3">
        {items.map((item) => (
          <ShortlistCard
            key={item.discoveryId}
            item={item}
            selected={selected.has(item.discoveryId)}
            onSelectedChange={(on) => toggle(item.discoveryId, on)}
            busy={running}
          />
        ))}
      </ol>
    </div>
  )
}
