'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { discardCaptureAction } from '@/app/(authed)/discoveries/post-actions'
import { PasteImportPanel } from './paste-import-panel'

/** The capture page's review: the "Add from text or link" flow, prefilled, with Discard. */
export function CaptureReview({ capture }: { capture: { id: string; text: string; url: string | null } }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const initial = [capture.text, capture.url ?? ''].filter(Boolean).join('\n\n')

  const discard = (): void => {
    startTransition(async () => {
      const r = await discardCaptureAction(capture.id)
      if (!r.ok) toast.error(r.error)
      else toast.success('Discarded')
      router.refresh()
    })
  }

  return (
    <div data-testid="capture-review">
      <PasteImportPanel
        initialText={initial}
        captureId={capture.id}
        onDone={() => router.push('/discoveries?posts=1')}
        secondary={
          <Button variant="outline" onClick={discard} disabled={pending} data-testid="capture-discard">
            Discard
          </Button>
        }
      />
    </div>
  )
}
