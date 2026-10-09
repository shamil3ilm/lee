'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { applyResetAction, backupResetAction, previewResetAction } from '@/app/(authed)/settings/profile/reset-actions'
import { CONFIRM_WORD, needsTypedConfirm, type ResetPreview, type ResetSelection } from '@/lib/reset/types'

interface ResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selection: ResetSelection
  onDone: () => void
}

/** Save JSON in the browser (nothing is uploaded anywhere). */
function download(data: unknown, now: Date): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lee-backup-${now.toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Reset details, step 2: exactly what will be removed, "Download a backup
 * first", RESET typed for a full reset, then the destructive confirm.
 */
export function ResetDialog({ open, onOpenChange, selection, onDone }: ResetDialogProps) {
  const router = useRouter()
  const [preview, setPreview] = useState<ResetPreview | null>(null)
  const [typed, setTyped] = useState('')
  const [backedUp, setBackedUp] = useState(false)
  const [pending, start] = useTransition()
  const typedNeeded = needsTypedConfirm(selection)

  // Mounted only while open (the panel renders it on demand), so each
  // opening starts from a fresh state and loads its own preview.
  useEffect(() => {
    if (!open) return
    let live = true
    void previewResetAction(selection).then((r) => {
      if (!live) return
      if (r.ok) setPreview(r.preview)
      else toast.error(r.error)
    })
    return () => {
      live = false
    }
  }, [open, selection])

  const backup = (): void =>
    start(async () => {
      const r = await backupResetAction(selection)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      download(r.backup, new Date())
      setBackedUp(true)
      toast.success('Backup downloaded.')
    })

  const confirm = (): void =>
    start(async () => {
      const r = await applyResetAction(selection, typed)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Reset done', { description: 'Match scores, best CVs and role suggestions are being recomputed.' })
      onOpenChange(false)
      onDone()
      router.refresh()
    })

  const nothing = preview !== null && preview.groups.length === 0
  const blocked = pending || preview === null || nothing || (typedNeeded && typed !== CONFIRM_WORD)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reset details</DialogTitle>
          <DialogDescription>This removes exactly what is listed below. It cannot be undone, so download a backup first.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-testid="reset-details-dialog">
          {preview === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking what will be removed…
            </p>
          ) : nothing ? (
            <p className="text-sm text-muted-foreground">Nothing to reset in what you selected.</p>
          ) : (
            <div className="space-y-3" aria-label="What will be removed" role="region">
              {preview.groups.map((g) => (
                <section key={g.label} className="space-y-1">
                  <h3 className="text-sm font-medium">
                    {g.label} <span className="font-normal text-muted-foreground">({g.count})</span>
                  </h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {g.items.map((item, i) => (
                      <li key={`${i}-${item}`} className="break-words">
                        {item}
                      </li>
                    ))}
                    {g.count > g.items.length ? <li>and {g.count - g.items.length} more</li> : null}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <ul className="list-disc space-y-1 rounded-md border bg-muted/30 py-2 pl-7 pr-3 text-xs text-muted-foreground" aria-label="Never touched">
            <li>Applications, documents already sent, tailored CVs and discoveries are never touched.</li>
            <li>Variants an application used are archived with their versions, so its history stays.</li>
            <li>Afterwards match scores, best CVs and role suggestions are recomputed.</li>
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={backup} disabled={pending || preview === null || nothing}>
            <Download className="size-3.5" aria-hidden="true" />
            {backedUp ? 'Download the backup again' : 'Download a backup first'}
          </Button>
          {typedNeeded ? (
            <FormField htmlFor="reset-confirm" label={`Type ${CONFIRM_WORD} to confirm`} help="Needed for a full reset.">
              <Input id="reset-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} aria-describedby="reset-confirm-help" />
            </FormField>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={blocked}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Reset selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
