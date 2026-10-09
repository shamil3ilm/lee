'use client'
import { AlertTriangle, Link2, Mail, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PostCandidate } from '@/lib/linkedin-posts/types'

/**
 * Review of one pasted / captured LinkedIn post before it becomes a
 * discovery: why it reads (or not) as a hiring post, Scam Shield's warning,
 * and the role / employer / poster the user may correct. A link-only paste
 * explains that lee keeps the link and asks for the post text.
 */

export type PostEdits = Pick<PostCandidate, 'role' | 'company' | 'posterName'>

interface PostReviewProps {
  post: PostCandidate
  onChange: (patch: Partial<PostEdits>) => void
}

function ContactLine({ post }: { post: PostCandidate }) {
  const { emails, dm, applyLinks } = post.contact
  if (emails.length === 0 && !dm && applyLinks.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="How to respond">
      {emails.map((e) => (
        <li key={e} className="inline-flex items-center gap-1">
          <Mail className="size-3.5" aria-hidden="true" />
          {e}
        </li>
      ))}
      {dm ? (
        <li className="inline-flex items-center gap-1">
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Asks for a DM
        </li>
      ) : null}
      {applyLinks.map((l) => (
        <li key={l} className="inline-flex min-w-0 items-center gap-1">
          <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{l}</span>
        </li>
      ))}
    </ul>
  )
}

export function PostReview({ post, onChange }: PostReviewProps) {
  return (
    <div className="space-y-3" data-testid="post-review">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="info">LinkedIn post</Badge>
        {post.linkOnly ? (
          <Badge variant="neutral">Link only</Badge>
        ) : post.hiring ? (
          <Badge variant="success">Reads as a hiring post</Badge>
        ) : (
          <Badge variant="warning">Doesn’t read as a hiring post</Badge>
        )}
        {post.location ? <Badge variant="neutral">{post.location}</Badge> : null}
      </div>
      {post.linkOnly ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground" role="note">
          lee keeps this as a link and never opens LinkedIn. To read the role, place and contact, open the post, select
          its text, copy it and paste it here together with the link.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {post.hiring ? 'Why: ' : 'Held back: '}
          {(post.hiring ? post.reasons : post.negatives.length > 0 ? post.negatives : ['no clear hiring phrase']).join(' · ')}
        </p>
      )}
      {post.risk ? (
        <p className="flex items-start gap-2 rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert" data-testid="post-review-risk">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Scam Shield: {post.risk.level}. {post.risk.labels.join('; ')}. Never pay to get a job.
          </span>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="post-role">Role</Label>
          <Input id="post-role" value={post.role} onChange={(e) => onChange({ role: e.target.value })} placeholder="e.g. Laravel Developer" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="post-company">Employer</Label>
          <Input id="post-company" value={post.company} onChange={(e) => onChange({ company: e.target.value })} placeholder="Not named in the post" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="post-poster">Posted by</Label>
          <Input id="post-poster" value={post.posterName} onChange={(e) => onChange({ posterName: e.target.value })} placeholder="Poster’s name" />
        </div>
      </div>
      {post.posterHeadline ? <p className="text-xs text-muted-foreground">{post.posterHeadline}</p> : null}
      <ContactLine post={post} />
      {post.text ? (
        <details className="rounded-md border p-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium">Post text kept (up to 1 KB)</summary>
          <p className="mt-2 whitespace-pre-line break-words text-muted-foreground">{post.text}</p>
        </details>
      ) : null}
    </div>
  )
}
