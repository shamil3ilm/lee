'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PasteImportPanel } from './paste-import-panel'

/**
 * "Add from text or link": paste an AI Mode answer, any text or links, or a
 * LinkedIn post → review what lee found → import what the user picks.
 */
interface PasteImportDialogProps {
  triggerVariant?: 'default' | 'outline'
  /** Phones: the trigger reads "Add jobs" so it fits beside a page title. */
  compact?: boolean
}

export function PasteImportDialog({ triggerVariant = 'outline', compact = false }: PasteImportDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // A new key per opening resets the panel's state.
  const [session, setSession] = useState(0)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setSession((s) => s + 1)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} data-testid="paste-import-trigger">
          <ClipboardPaste className="size-4" aria-hidden="true" />
          {compact ? (
            <>
              <span className="sm:hidden">Add jobs</span>
              <span className="max-sm:hidden">Add from text or link</span>
            </>
          ) : (
            'Add from text or link'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from text or link</DialogTitle>
          <DialogDescription>
            Paste an AI Mode answer, an email, job links, or a LinkedIn post (its text and link). lee lists what it finds;
            you pick what to add. Links are kept as links: lee never opens LinkedIn, Indeed, Naukri, Bayt or similar
            pages, and reads details only from employers’ public job boards (Greenhouse, Lever, Ashby, Workable, Workday).
          </DialogDescription>
        </DialogHeader>
        <PasteImportPanel
          key={session}
          onDone={() => {
            setOpen(false)
            setSession((s) => s + 1)
            router.refresh()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
