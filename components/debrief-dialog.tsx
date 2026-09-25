'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { FeedbackButtons } from '@/components/feedback-buttons'

const DEBRIEF_TEMPLATE = `## What went well
-

## What to improve
-

## Questions asked
-

## Red flags / concerns
-

## Prep topics for next round
- `

interface DebriefDialogProps {
  stageId: string
  stageLabel: string
  initialNotes: string | null
  existingDebriefDocId?: string | null
  triggerVariant?: 'add' | 'edit'
  // Controlled mode — when open/onOpenChange are provided the parent owns the
  // open state and the internal DialogTrigger is skipped. Used for edit-in-place
  // from a chip button that isn't the natural trigger.
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DebriefDialog({
  stageId,
  stageLabel,
  initialNotes,
  existingDebriefDocId,
  triggerVariant = 'add',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DebriefDialogProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen

  // Pre-fill with the template when there are no existing notes so the user
  // has structure to type into. When notes exist, load them for editing.
  const [notes, setNotes] = useState<string>(initialNotes?.trim() ? initialNotes : DEBRIEF_TEMPLATE)
  const [savingNotes, setSavingNotes] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [lastGeneratedDocId, setLastGeneratedDocId] = useState<string | null>(
    existingDebriefDocId ?? null,
  )

  const notesAreMeaningful = notes.trim().length > 0 && notes.trim() !== DEBRIEF_TEMPLATE.trim()

  async function saveNotes(): Promise<boolean> {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/stages/${stageId}/debrief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notesMd: notes }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Could not save debrief notes.')
        return false
      }
      toast.success('Debrief saved')
      router.refresh()
      return true
    } catch {
      toast.error('Network error — could not save debrief.')
      return false
    } finally {
      setSavingNotes(false)
    }
  }

  async function generateAI(): Promise<void> {
    if (!notesAreMeaningful) {
      toast.error('Add some notes first — the AI needs something to summarise.')
      return
    }
    // Save first so the AI reads the freshest notes.
    const ok = await saveNotes()
    if (!ok) return
    setGeneratingAI(true)
    try {
      const res = await fetch(`/api/stages/${stageId}/debrief/generate`, {
        method: 'POST',
      })
      const json = (await res.json().catch(() => ({}))) as {
        documentId?: string
        downloadUrl?: string
        error?: string
        skipped?: boolean
        message?: string
        fixHint?: string
      }
      if (json.skipped) {
        toast.warning(
          json.message
            ? `${json.message}${json.fixHint ? ` — ${json.fixHint}` : ''}`
            : 'AI summary skipped.',
        )
        return
      }
      if (!res.ok || !json.documentId) {
        toast.error(json.error ?? 'Could not generate AI summary.')
        return
      }
      setLastGeneratedDocId(json.documentId)
      toast.success('AI summary generated')
      router.refresh()
    } catch {
      toast.error('Network error — could not generate AI summary.')
    } finally {
      setGeneratingAI(false)
    }
  }

  async function handleSaveAndClose(): Promise<void> {
    const ok = await saveNotes()
    if (ok) setOpen(false)
  }

  const trigger = (
    <Button
      type="button"
      variant={triggerVariant === 'add' ? 'ghost' : 'outline'}
      size="sm"
      className="h-7 px-2 text-xs"
    >
      {triggerVariant === 'add' ? '+ Add debrief' : 'Edit debrief'}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Debrief · {stageLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Quick reflection while it&apos;s fresh. Structured notes make the AI summary
            (and your next-round prep) much sharper.
          </p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            className="min-h-[280px] font-mono text-xs"
            aria-label="Debrief notes"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void generateAI()
              }}
              disabled={savingNotes || generatingAI || !notesAreMeaningful}
              title={
                notesAreMeaningful
                  ? undefined
                  : 'Add notes before generating an AI summary'
              }
            >
              {generatingAI ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {generatingAI ? 'Generating…' : 'Generate AI summary'}
            </Button>
            {lastGeneratedDocId ? (
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                >
                  <Link
                    href={`/api/documents/${lastGeneratedDocId}/pdf`}
                    target="_blank"
                  >
                    <Download className="size-3.5" />
                    Download AI summary
                  </Link>
                </Button>
                <FeedbackButtons documentId={lastGeneratedDocId} caption={null} />
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSaveAndClose()
            }}
            disabled={savingNotes || generatingAI}
          >
            {savingNotes ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {savingNotes ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
