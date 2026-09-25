'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * v10 — 👍/👎 buttons rendered beneath any AI-generated document view. Posts
 * to `/api/documents/{id}/rate` which routes the rating to the underlying
 * ai_call_logs row. State is optimistic — the coloured chip stays lit once
 * the request resolves so users see their vote persisted across renders
 * (per-render, not per-page — a refresh clears it, which is fine for the
 * v10 MVP; a persisted-lookup pass lives in v10.1).
 */
interface FeedbackButtonsProps {
  documentId: string
  className?: string
  /** Optional caption below the buttons; defaults to a subtle helper string. */
  caption?: string | null
}

type Rating = 'up' | 'down' | null

export function FeedbackButtons({
  documentId,
  className,
  caption = 'Ratings help improve future generations',
}: FeedbackButtonsProps) {
  const [rated, setRated] = useState<Rating>(null)
  const [busy, setBusy] = useState<Rating>(null)

  async function submit(next: Exclude<Rating, null>): Promise<void> {
    setBusy(next)
    try {
      const res = await fetch(`/api/documents/${documentId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: next === 'up' ? 5 : 1 }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Could not save rating.')
        return
      }
      setRated(next)
      toast.success(next === 'up' ? 'Thanks — noted 👍' : 'Thanks for the honest feedback 👎')
    } catch {
      toast.error('Network error — could not save rating.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'h-7 w-7',
            rated === 'up' && 'border-emerald-500 text-emerald-600',
          )}
          disabled={busy !== null}
          onClick={() => {
            void submit('up')
          }}
          aria-label="Rate helpful"
          aria-pressed={rated === 'up'}
        >
          {busy === 'up' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ThumbsUp className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'h-7 w-7',
            rated === 'down' && 'border-rose-500 text-rose-600',
          )}
          disabled={busy !== null}
          onClick={() => {
            void submit('down')
          }}
          aria-label="Rate unhelpful"
          aria-pressed={rated === 'down'}
        >
          {busy === 'down' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ThumbsDown className="size-3.5" />
          )}
        </Button>
      </div>
      {caption ? (
        <p className="text-[10px] text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  )
}
