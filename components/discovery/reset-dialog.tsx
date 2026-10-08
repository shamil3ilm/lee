'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resetDiscoveriesAction } from '@/app/(authed)/discoveries/reset-actions'
import { Checkbox } from '@/components/ui/checkbox'

export interface ResetSource {
  id: string
  name: string
}

interface ResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: readonly ResetSource[]
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  )
}

/**
 * "Reset discoveries": choose the sources and what to remove, read exactly
 * what happens, confirm. Saved jobs, applications and anything being
 * prepared are never touched.
 */
export function ResetDiscoveriesDialog({ open, onOpenChange, sources }: ResetDialogProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [shortlisted, setShortlisted] = useState(false)
  const [reimport, setReimport] = useState(true)
  const [learned, setLearned] = useState(false)
  const [refetch, setRefetch] = useState(true)

  const toggle = (id: string): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirm = (): void =>
    start(async () => {
      const r = await resetDiscoveriesAction({
        sourceIds: scope === 'selected' ? [...picked] : [],
        includeShortlisted: shortlisted,
        allowReimport: reimport,
        resetLearned: learned,
        refetch,
      })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Removed ${r.deleted} discoveries`, {
        description: r.remaining
          ? 'Some are left: run the reset again to finish.'
          : r.refetching > 0
            ? `Fetching ${r.refetching} ${r.refetching === 1 ? 'source' : 'sources'} again. Progress: Settings › Background jobs.`
            : undefined,
      })
      onOpenChange(false)
      router.refresh()
    })

  const blocked = scope === 'selected' && picked.size === 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reset discoveries</DialogTitle>
          <DialogDescription>Clear the postings your sources found, so the inbox fills afresh.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-testid="reset-dialog">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Sources</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="reset-scope" checked={scope === 'all'} onChange={() => setScope('all')} /> All sources
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="reset-scope" checked={scope === 'selected'} onChange={() => setScope('selected')} /> Selected sources
            </label>
            {scope === 'selected' ? (
              <div className="ml-6 grid gap-1 sm:grid-cols-2">
                {sources.map((s) => (
                  <Check key={s.id} label={s.name} checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                ))}
              </div>
            ) : null}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What to remove</legend>
            <p className="text-xs text-muted-foreground">New, filtered-out and dismissed postings.</p>
            <Check label="Also remove shortlisted postings I have not acted on" checked={shortlisted} onChange={setShortlisted} />
            <Check
              label="Allow re-import"
              hint="Dismissed postings are kept as small records so they never come back. Removing them lets a source bring them back if it still lists them."
              checked={reimport}
              onChange={setReimport}
            />
            <Check label="Also reset learned titles and “Not for me” feedback" checked={learned} onChange={setLearned} />
            <Check label="Fetch fresh postings now" hint="Polls the enabled sources right away." checked={refetch} onChange={setRefetch} />
          </fieldset>
          <ul className="list-disc space-y-1 rounded-md border bg-muted/30 py-2 pl-7 pr-3 text-xs text-muted-foreground" aria-label="What happens">
            <li>Saved jobs, applications and anything you are preparing are never removed.</li>
            <li>Their Scam Shield checks, shortlist entries and Match Scores go with them.</li>
            <li>Your search preferences stay{learned ? '; learned titles are cleared' : ', and so do the titles lee learned'}.</li>
            <li>This cannot be undone.</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending || blocked}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Reset discoveries
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
