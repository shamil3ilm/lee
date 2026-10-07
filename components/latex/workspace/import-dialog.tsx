'use client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ImportTexDialogProps {
  /** The .tex file waiting for a choice, or null when closed. */
  file: File | null
  /** The name it would get as a separate file, or null when taken. */
  separateName: string | null
  onReplace: () => void
  onAdd: () => void
  onCancel: () => void
}

/** Importing a .tex file: replace main.tex, or add it as its own file. */
export function ImportTexDialog({ file, separateName, onReplace, onAdd, onCancel }: ImportTexDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import {file?.name}</DialogTitle>
          <DialogDescription>
            Replace this document&apos;s main.tex with it (you can undo with Ctrl/⌘+Z), or add it as a separate file you can
            \input from main.tex.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={onAdd} disabled={separateName === null} title={separateName ? undefined : 'A file with that name already exists'}>
            Add as {separateName ?? 'a separate file'}
          </Button>
          <Button type="button" onClick={onReplace}>
            Replace main.tex
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
