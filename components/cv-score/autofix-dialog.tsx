'use client'
import { useState } from 'react'
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
import { applyFix, type AutofixChange, type AutofixPreview } from './client'

interface AutofixDialogProps {
  preview: AutofixPreview | null
  onClose: () => void
  onApplied: (applied: { documentId: string; version: number }) => void
}

function changeKey(c: AutofixChange): string {
  return c.kind === 'rewrite_bullet' ? c.path : `skill:${c.term}`
}

/**
 * Structured diff of proposed master-CV changes. Nothing is saved until the
 * user clicks Apply; they can untick individual changes first.
 */
export function AutofixDialog({ preview, onClose, onApplied }: AutofixDialogProps) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const changes = preview?.changes ?? []
  const selected = changes.filter((c) => !excluded.has(changeKey(c)))

  function toggle(key: string): void {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function apply(): Promise<void> {
    if (!preview || selected.length === 0) return
    setBusy(true)
    const res = await applyFix(preview.baseDocumentId, selected)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`Saved master CV v${res.data.version} with ${res.data.applied} change(s).`)
    setExcluded(new Set())
    onApplied({ documentId: res.data.documentId, version: res.data.version })
  }

  return (
    <Dialog open={preview !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview fixes</DialogTitle>
          <DialogDescription>
            Applying saves a new version of your master CV (v{(preview?.baseVersion ?? 0) + 1}). Your current version is kept.
          </DialogDescription>
        </DialogHeader>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No safe automatic changes could be prepared.</p>
        ) : (
          <ul className="space-y-3">
            {changes.map((c) => {
              const key = changeKey(c)
              return (
                <li key={key} className="rounded-md border p-3 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!excluded.has(key)}
                      onChange={() => toggle(key)}
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-xs font-medium text-muted-foreground">
                        {c.kind === 'rewrite_bullet' ? `Rewrite bullet · ${c.path}` : 'Add to Skills (secondary)'}
                      </span>
                      {c.kind === 'rewrite_bullet' ? (
                        <>
                          <span className="block rounded bg-rose-500/10 px-2 py-1 line-through decoration-rose-500/60">{c.before}</span>
                          <span className="block rounded bg-emerald-500/10 px-2 py-1">{c.after}</span>
                        </>
                      ) : (
                        <span className="block rounded bg-emerald-500/10 px-2 py-1">+ {c.term}</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {preview?.rejected.length ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Not applied automatically</p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {preview.rejected.map((r) => (
                <li key={r.findingId}>{r.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={busy || selected.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Apply {selected.length} change{selected.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
