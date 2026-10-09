'use client'
import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { previewCompanyResetAction, resetCompaniesAction } from '@/app/(authed)/discoveries/company-reset-actions'
import type { CompanyResetCounts } from '@/lib/company-discovery/reset'
import { plural } from '@/lib/ui/labels'

/**
 * "Reset companies": like "Reset discoveries" for jobs. Choose what to keep,
 * see the counts, confirm (typing RESET when watched companies go too).
 * Applications, contacts and jobs are never touched.
 */
export function ResetCompaniesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const confirmId = useId()
  const [pending, start] = useTransition()
  const [keepWatched, setKeepWatched] = useState(true)
  const [includeOwn, setIncludeOwn] = useState(false)
  const [runNow, setRunNow] = useState(true)
  const [typed, setTyped] = useState('')
  const [counts, setCounts] = useState<CompanyResetCounts | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    void previewCompanyResetAction({ keepWatched, includeOwn }).then((r) => {
      if (live) setCounts('counts' in r ? r.counts : null)
    })
    return () => {
      live = false
    }
  }, [open, keepWatched, includeOwn])

  const needsTyping = !keepWatched
  const blocked = pending || (needsTyping && typed.trim() !== 'RESET') || counts?.remove === 0

  const confirm = (): void =>
    start(async () => {
      const r = await resetCompaniesAction({ keepWatched, includeOwn, runNow, confirm: typed })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Removed ${plural(r.deleted, 'company', 'companies')}`, {
        description: r.remaining ? 'Some are left: run the reset again to finish.' : r.queued ? 'Searching again now. Progress: Settings › Background jobs.' : undefined,
      })
      onOpenChange(false)
      setTyped('')
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reset companies</DialogTitle>
          <DialogDescription>Remove the companies lee found, so the next search finds them afresh.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-testid="reset-companies-dialog">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What to keep</legend>
            <Checkbox id="rc-keep-watched" checked={keepWatched} onChange={(e) => setKeepWatched(e.target.checked)} label="Keep companies I'm watching or saved" data-testid="reset-keep-watched" />
            <Checkbox
              id="rc-include-own"
              checked={includeOwn}
              onChange={(e) => setIncludeOwn(e.target.checked)}
              label="Also remove companies I added myself"
              description="Pasted or found by name."
              data-testid="reset-include-own"
            />
            <Checkbox id="rc-run-now" checked={runNow} onChange={(e) => setRunNow(e.target.checked)} label="Run discovery now" description="Re-reads every park and member list from the first page." />
          </fieldset>
          <div className="rounded-md border p-3 text-sm" role="status" aria-live="polite" data-testid="reset-companies-counts">
            {counts === null ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Counting…
              </span>
            ) : (
              <>
                <p className="font-medium">{plural(counts.remove, 'company', 'companies')} will be removed.</p>
                <p className="text-xs text-muted-foreground">
                  Kept: {counts.keptWatched} watched or saved · {counts.keptOwn} added by you · {counts.keptLinked} with a speculative application or in your companies list.
                </p>
              </>
            )}
          </div>
          <ul className="list-disc space-y-1 rounded-md border bg-muted/30 py-2 pl-7 pr-3 text-xs text-muted-foreground" aria-label="What happens">
            <li className="font-medium text-foreground">This cannot be undone.</li>
            <li>Their growth scores, signals and weekly role counts go with them; dismissed companies can come back.</li>
            <li>Applications, contacts, jobs and your companies list are never touched.</li>
            <li>Job-board sources and careers-page links you added with “Watch” stay in Settings › Sources.</li>
          </ul>
          {needsTyping ? (
            <div className="space-y-1.5">
              <Label htmlFor={confirmId}>Type RESET to remove the companies you watch too</Label>
              <Input id={confirmId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="reset-companies-confirm-text" />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={blocked} data-testid="reset-companies-confirm">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Reset companies
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
