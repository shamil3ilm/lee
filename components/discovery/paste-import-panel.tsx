'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { extractPastedOpenings, importPastedOpenings } from '@/app/(authed)/discoveries/import-actions'
import { importPastedPostAction } from '@/app/(authed)/discoveries/post-actions'
import type { PostCandidate } from '@/lib/linkedin-posts/types'
import { PasteImportReview, type ReviewRow } from './paste-import-review'
import { PostReview, type PostEdits } from './post-review'

/**
 * The body of "Add from text or link" (the Discovery dialog and the
 * "Send to lee" capture page): paste → review → add. A single LinkedIn
 * post (its text and/or link) is reviewed as a hiring post; anything else
 * as a list of openings.
 */

const MAX_CHARS = 20_000

function summaryText(s: { imported: number; duplicates: number; enriched: number; quarantined: number }): string {
  const parts = [`${s.imported} added to Discovery`]
  if (s.duplicates > 0) parts.push(`${s.duplicates} already there`)
  if (s.enriched > 0) parts.push(`${s.enriched} with details from the employer’s job board`)
  if (s.quarantined > 0) parts.push(`${s.quarantined} quarantined by Scam Shield`)
  return parts.join(' · ')
}

interface PasteImportPanelProps {
  initialText?: string
  /** A "Send to lee" capture: deleted once its post is added. */
  captureId?: string
  onDone: () => void
  /** Rendered left of the main button (e.g. Discard on the capture page). */
  secondary?: React.ReactNode
}

export function PasteImportPanel({ initialText = '', captureId, onDone, secondary }: PasteImportPanelProps) {
  const [text, setText] = useState(initialText.slice(0, MAX_CHARS))
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [post, setPost] = useState<PostCandidate | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const back = (): void => {
    setRows(null)
    setPost(null)
  }

  const find = (): void => {
    startTransition(async () => {
      const r = await extractPastedOpenings(text)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      if (r.result.post) {
        setPost(r.result.post)
        return
      }
      setRows(r.result.candidates.map((c) => ({ ...c, picked: Boolean(c.url) && Boolean(c.title) })))
      setNote(r.result.note)
    })
  }

  const picked = (rows ?? []).filter((r) => r.picked && r.url && r.title.trim())

  const importPicked = (): void => {
    startTransition(async () => {
      const r = await importPastedOpenings(
        picked.map((p) => ({ title: p.title, employer: p.employer, location: p.location, postedDate: p.postedDate, url: p.url, snippet: p.snippet })),
      )
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(summaryText(r.summary))
      onDone()
    })
  }

  const importPost = (): void => {
    if (!post) return
    startTransition(async () => {
      const r = await importPastedPostAction(
        {
          via: captureId ? 'capture' : 'paste',
          text: post.text,
          postUrl: post.postUrl,
          posterName: post.posterName,
          posterHeadline: post.posterHeadline,
          posterUrl: post.posterUrl,
          role: post.role,
          company: post.company,
        },
        captureId,
      )
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(
        r.duplicate ? 'That post is already in Discovery' : r.quarantined ? 'Added, and quarantined by Scam Shield' : 'Hiring post added to Discovery',
      )
      onDone()
    })
  }

  const editPost = (patch: Partial<PostEdits>): void => setPost((p) => (p ? { ...p, ...patch } : p))
  const reviewing = rows !== null || post !== null

  return (
    <div className="space-y-3">
      {!reviewing ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            rows={8}
            placeholder={'Backend Engineer at Example Co (Dubai) https://…\nor a LinkedIn post’s text and link'}
            aria-label="Text or links to add"
            data-testid="paste-import-text"
          />
          <p className="text-xs text-muted-foreground">
            Openings are read by your AI provider when you have a key (links only without one); a single LinkedIn post is
            read by lee itself. Leave out personal details.
          </p>
        </div>
      ) : post ? (
        <PostReview post={post} onChange={editPost} />
      ) : (
        <div className="space-y-2">
          <PasteImportReview rows={rows ?? []} onChange={(key, patch) => setRows((prev) => (prev ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)))} />
          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondary}
        {!reviewing ? (
          <Button onClick={find} disabled={pending || text.trim().length === 0} data-testid="paste-import-find">
            {pending ? 'Reading…' : 'Find openings'}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={back} disabled={pending}>
              Back
            </Button>
            {post ? (
              <Button onClick={importPost} disabled={pending} data-testid="post-import-submit">
                {pending ? 'Adding…' : post.linkOnly ? 'Add the link to Discovery' : 'Add hiring post to Discovery'}
              </Button>
            ) : (
              <Button onClick={importPicked} disabled={pending || picked.length === 0} data-testid="paste-import-submit">
                {pending ? 'Adding…' : `Add ${picked.length} to Discovery`}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
