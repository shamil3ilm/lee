'use client'
import { toast } from 'sonner'
import { updateSource } from '@/app/(authed)/settings/sources/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSourceKind, sourceKindNeeds } from '@/lib/discovery/source-kinds'

export interface SourceEditFields {
  id: string
  name: string
  kind: string
  enabled: boolean
  /** Board slug for ATS boards, feed URL for RSS / JSON-LD, '' otherwise. */
  configValue: string
}

interface SourceEditDialogProps {
  source: SourceEditFields
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SourceEditDialog({ source, open, onOpenChange }: SourceEditDialogProps) {
  const meta = getSourceKind(source.kind)
  const needs = sourceKindNeeds(source.kind)

  async function handleSubmit(fd: FormData): Promise<void> {
    fd.set('enabled', fd.get('enabled') === 'on' ? 'true' : 'false')
    const result = await updateSource(source.id, fd)
    if ('success' in result) {
      toast.success('Source updated')
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit source</DialogTitle>
          <DialogDescription>
            {meta?.label ?? source.kind}
            {meta ? ` — ${meta.description}` : ''}. The kind can&apos;t change; add a new source
            for a different board type.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-source-name">Display name</Label>
            <Input
              id="edit-source-name"
              name="name"
              defaultValue={source.name}
              placeholder="Auto-generated from kind + config"
            />
          </div>
          {needs === 'company' ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-source-company">Board slug *</Label>
              <Input
                id="edit-source-company"
                name="company"
                required
                placeholder={meta?.placeholder}
                defaultValue={source.configValue}
              />
            </div>
          ) : null}
          {needs === 'url' ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-source-url">Feed URL *</Label>
              <Input
                id="edit-source-url"
                name="url"
                type="url"
                required
                placeholder={meta?.placeholder}
                defaultValue={source.configValue}
              />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={source.enabled}
              className="size-4 rounded border-input"
            />
            Poll this source on the discovery cycle
          </label>
          <p className="text-xs text-muted-foreground">
            Changing the slug or URL resets the error count so the next cycle starts fresh.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
