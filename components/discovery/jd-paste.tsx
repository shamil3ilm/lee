'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardPaste, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { fetchJdAction, pasteJdAction } from '@/app/(authed)/discoveries/jd-actions'

/**
 * On a title-only discovery (no usable JD): "Fetch the full JD" when the
 * posting is on an ATS with a public job API, and "Paste the JD to score
 * properly" always. Both store the JD and re-score the row.
 */
export function JdPaste({ discoveryId, canFetch }: { discoveryId: string; canFetch: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()

  const finish = (r: Awaited<ReturnType<typeof pasteJdAction>>): void => {
    if ('error' in r) {
      toast.error(r.error)
      return
    }
    toast.success(`Scored from the JD: Match ${r.score}`)
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2" data-testid="jd-actions">
      <span className="text-xs text-muted-foreground">Low confidence: title only.</span>
      {canFetch ? (
        <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => startTransition(async () => finish(await fetchJdAction(discoveryId)))}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Fetch the full JD
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-7">
            <ClipboardPaste className="size-3.5" />
            Paste the JD to score properly
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste the job description</DialogTitle>
            <DialogDescription>
              lee compares the requirements and responsibilities with your ready profile evidence. Nothing is sent anywhere.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Job description"
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Responsibilities, requirements, nice to have…"
          />
          <DialogFooter>
            <Button disabled={pending || text.trim().length === 0} onClick={() => startTransition(async () => finish(await pasteJdAction(discoveryId, text)))}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save and re-score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
