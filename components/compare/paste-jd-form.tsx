'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardPaste } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { pasteJdAction } from '@/app/(authed)/compare/actions'

/** Shown when a posting has little or no description: the comparison needs the full JD. */
export function PasteJdForm({ discoveryId }: { discoveryId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const save = (): void =>
    start(async () => {
      const r = await pasteJdAction(discoveryId, text)
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message)
        setText('')
        router.refresh()
      }
    })
  return (
    <form
      className="space-y-2 rounded-lg border border-dashed p-3"
      data-testid="paste-jd"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label htmlFor={`paste-jd-${discoveryId}`} className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardPaste className="size-4" aria-hidden="true" />
        Paste the JD
      </label>
      <p className="text-xs text-muted-foreground">
        This posting has little or no description, so benefits, growth and work-life are unknown. Paste the full job description
        from the posting; lee compares from its text and quotes the lines it used.
      </p>
      <Textarea id={`paste-jd-${discoveryId}`} rows={6} maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" size="sm" disabled={pending || text.trim().length === 0}>
        Save description
      </Button>
    </form>
  )
}
