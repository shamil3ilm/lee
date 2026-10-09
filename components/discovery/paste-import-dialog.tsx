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
export function PasteImportDialog({ triggerVariant = 'outline' }: { triggerVariant?: 'default' | 'outline' }) {
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
          Add from text or link
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
