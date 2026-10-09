'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Mail, MessageSquareReply, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { draftPostReplyAction, trackHiringPostAction } from '@/app/(authed)/discoveries/post-actions'
import type { ReplyPlan } from '@/lib/linkedin-posts/reply-service'
import { LINKEDIN_POST_LABEL, type PostRowView } from '@/lib/linkedin-posts/types'

/**
 * A LinkedIn hiring post on its Discovery card: who posted it, a fact-locked
 * reply the user copies and sends themselves (lee never sends LinkedIn
 * messages), and "Track it" (application + the poster as a contact +
 * follow-ups).
 */

export function PostSourceChip() {
  return <Badge variant="info">{LINKEDIN_POST_LABEL}</Badge>
}

export function PostedBy({ post }: { post: PostRowView }) {
  if (!post.posterName) return null
  return (
    <p className="mt-0.5 truncate text-xs text-muted-foreground" data-testid="post-poster">
      Posted by{' '}
      {post.posterUrl ? (
        <a href={post.posterUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
          {post.posterName}
        </a>
      ) : (
        <span className="font-medium text-foreground">{post.posterName}</span>
      )}
      {post.posterHeadline ? ` · ${post.posterHeadline}` : null}
    </p>
  )
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied: paste it into LinkedIn or your email and send it yourself')
  } catch {
    toast.error('Could not copy. Select the text and copy it instead.')
  }
}

function Hints({ plan }: { plan: ReplyPlan }) {
  const lines: string[] = []
  if (plan.posterIsConnection) lines.push('The poster is one of your LinkedIn connections.')
  if (plan.referral) {
    const names = plan.referral.people.slice(0, 3).map((p) => p.name).join(', ')
    lines.push(`You know ${plan.referral.count} ${plan.referral.count === 1 ? 'person' : 'people'} at ${plan.referral.company}${names ? `: ${names}` : ''}. Ask for a referral first.`)
  }
  if (lines.length === 0) return null
  return (
    <div className="flex items-start gap-2 rounded-md bg-info-soft p-2 text-sm text-info" data-testid="post-referral-hint">
      <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  )
}

function TrackSection({ discoveryId, onTracked }: { discoveryId: string; onTracked: () => void }) {
  const [sent, setSent] = useState(true)
  const [pending, startTransition] = useTransition()
  const track = (): void => {
    startTransition(async () => {
      const r = await trackHiringPostAction({ discoveryId, sent })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(r.alreadyTracked ? 'Already tracked in Applications' : sent ? 'Tracked: marked applied, follow-up scheduled' : 'Tracked in Applications')
      onTracked()
    })
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={sent} onChange={(e) => setSent(e.target.checked)} aria-label="I have sent my reply" />
        I have sent my reply (schedule a follow-up)
      </label>
      <Button onClick={track} disabled={pending} data-testid="post-track">
        {pending ? 'Tracking…' : 'Track it'}
      </Button>
    </div>
  )
}

export function PostReplyDialog({ discoveryId, title, canEmail }: { discoveryId: string; title: string; canEmail: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<ReplyPlan | null>(null)
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [pending, startTransition] = useTransition()

  const load = (channel?: 'linkedin' | 'email'): void => {
    startTransition(async () => {
      const r = await draftPostReplyAction({ discoveryId, channel })
      if (!r.ok) {
        toast.error(r.error)
        setOpen(false)
        return
      }
      setPlan(r.plan)
      setBody(r.plan.draft.body)
      setSubject(r.plan.draft.subject ?? '')
    })
  }

  const channel = plan?.draft.channel ?? 'linkedin'
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v && !plan) load()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="post-reply-trigger">
          <MessageSquareReply className="size-4" aria-hidden="true" />
          Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reply to the hiring post</DialogTitle>
          <DialogDescription>
            A short draft from your CV and the post only, for “{title}”. Edit it, copy it and send it yourself: lee never
            sends LinkedIn messages or emails for you.
          </DialogDescription>
        </DialogHeader>
        {!plan ? (
          <p className="text-sm text-muted-foreground" role="status">
            Drafting…
          </p>
        ) : (
          <div className="space-y-3" data-testid="post-reply">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Send as">
              <Button size="sm" variant={channel === 'linkedin' ? 'secondary' : 'ghost'} aria-pressed={channel === 'linkedin'} onClick={() => load('linkedin')} disabled={pending}>
                LinkedIn message
              </Button>
              {canEmail ? (
                <Button size="sm" variant={channel === 'email' ? 'secondary' : 'ghost'} aria-pressed={channel === 'email'} onClick={() => load('email')} disabled={pending}>
                  <Mail className="size-4" aria-hidden="true" />
                  Email
                </Button>
              ) : null}
              <Badge variant={plan.draft.origin === 'ai' ? 'info' : 'neutral'}>{plan.draft.origin === 'ai' ? 'AI draft, fact-checked' : 'Template'}</Badge>
            </div>
            <Hints plan={plan} />
            {plan.variant ? (
              <p className="text-xs text-muted-foreground">
                Attach your <span className="font-medium text-foreground">{plan.variant.name}</span> CV ({plan.variant.reason}).
              </p>
            ) : null}
            {channel === 'email' ? (
              <div className="space-y-1">
                <Label htmlFor="post-reply-subject">Subject{plan.draft.to ? ` (to ${plan.draft.to})` : ''}</Label>
                <Input id="post-reply-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="post-reply-body">Message</Label>
              <Textarea id="post-reply-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} data-testid="post-reply-body" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copy(channel === 'email' ? `${subject}\n\n${body}` : body)}>
                <Copy className="size-4" aria-hidden="true" />
                Copy
              </Button>
              {channel === 'linkedin' && plan.posterUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={plan.posterUrl} target="_blank" rel="noopener noreferrer">
                    Open their profile
                  </a>
                </Button>
              ) : null}
            </div>
            <TrackSection
              discoveryId={discoveryId}
              onTracked={() => {
                setOpen(false)
                router.refresh()
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function PostTrackButton({ discoveryId }: { discoveryId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const track = (): void => {
    startTransition(async () => {
      const r = await trackHiringPostAction({ discoveryId, sent: false })
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(r.alreadyTracked ? 'Already tracked in Applications' : 'Tracked in Applications')
        router.refresh()
      }
    })
  }
  return (
    <Button size="sm" variant="ghost" onClick={track} disabled={pending} data-testid="post-track-row">
      Track
    </Button>
  )
}
