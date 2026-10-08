'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { extractPastedOpenings, importPastedOpenings } from '@/app/(authed)/discoveries/import-actions'
import { PasteImportReview, type ReviewRow } from './paste-import-review'

/**
 * "Add from text or link": paste an AI Mode answer, any text or links →
 * review what lee found → import the ticked openings as discoveries.
 */

const MAX_CHARS = 20_000

function summaryText(s: { imported: number; duplicates: number; enriched: number; quarantined: number }): string {
  const parts = [`${s.imported} added to Discovery`]
  if (s.duplicates > 0) parts.push(`${s.duplicates} already there`)
  if (s.enriched > 0) parts.push(`${s.enriched} with details from the employer’s job board`)
  if (s.quarantined > 0) parts.push(`${s.quarantined} quarantined by Scam Shield`)
  return parts.join(' · ')
}

export function PasteImportDialog({ triggerVariant = 'outline' }: { triggerVariant?: 'default' | 'outline' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reset = (): void => {
    setText('')
    setRows(null)
    setNote(null)
  }

  const find = (): void => {
    startTransition(async () => {
      const r = await extractPastedOpenings(text)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setRows(r.result.candidates.map((c) => ({ ...c, picked: Boolean(c.url) && Boolean(c.title) })))
      setNote(r.result.note)
    })
  }

  const picked = (rows ?? []).filter((r) => r.picked && r.url && r.title.trim())

  const importPicked = (): void => {
    startTransition(async () => {
      const r = await importPastedOpenings(
        picked.map((p) => ({
          title: p.title,
          employer: p.employer,
          location: p.location,
          postedDate: p.postedDate,
          url: p.url,
          snippet: p.snippet,
        })),
      )
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(summaryText(r.summary))
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} data-testid="paste-import-trigger">
          <ClipboardPaste className="size-4" aria-hidden="true" />
          Add from text or link
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from text or link</DialogTitle>
          <DialogDescription>
            Paste an AI Mode answer, an email or one or more job links. lee lists the openings it finds; you pick what to
            add. Links are kept as links: lee never opens LinkedIn, Indeed, Naukri, Bayt or similar pages, and reads
            details only from employers’ public job boards (Greenhouse, Lever, Ashby, Workable, Workday).
          </DialogDescription>
        </DialogHeader>
        {rows === null ? (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              rows={8}
              placeholder={'Backend Engineer at Example Co (Dubai) https://…\nhttps://jobs.lever.co/…'}
              aria-label="Text or links to add"
              data-testid="paste-import-text"
            />
            <p className="text-xs text-muted-foreground">
              Text is read by your AI provider when you have a key (links only without one). Leave out personal details.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <PasteImportReview rows={rows} onChange={(key, patch) => setRows((prev) => (prev ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)))} />
            {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
          </div>
        )}
        <DialogFooter className="gap-2">
          {rows === null ? (
            <Button onClick={find} disabled={pending || text.trim().length === 0} data-testid="paste-import-find">
              {pending ? 'Reading…' : 'Find openings'}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setRows(null)} disabled={pending}>
                Back
              </Button>
              <Button onClick={importPicked} disabled={pending || picked.length === 0} data-testid="paste-import-submit">
                {pending ? 'Adding…' : `Add ${picked.length} to Discovery`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
