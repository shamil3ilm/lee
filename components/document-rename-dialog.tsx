'use client'
import { toast } from 'sonner'
import { renameDocument } from '@/app/(authed)/documents/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DocumentRenameDialogProps {
  documentId: string
  currentTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentRenameDialog({
  documentId,
  currentTitle,
  open,
  onOpenChange,
}: DocumentRenameDialogProps) {
  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await renameDocument(documentId, String(fd.get('title') ?? ''))
    if ('success' in result) {
      toast.success('Document renamed')
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-document-title">Title</Label>
            <Input
              id="rename-document-title"
              name="title"
              required
              maxLength={200}
              autoFocus
              defaultValue={currentTitle}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Rename</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
