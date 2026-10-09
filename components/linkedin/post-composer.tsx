'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { draftPostAction, publishPostAction } from '@/app/(authed)/settings/linkedin/actions'
import type { PostSourceKind } from '@/lib/integrations/linkedin/composer'

export interface ComposerSourceOption {
  id: string
  kind: Exclude<PostSourceKind, 'custom'>
  label: string
}

const KIND_LABELS: Readonly<Record<ComposerSourceOption['kind'], string>> = {
  achievement: 'Achievement',
  case_study: 'Case study',
  radar: 'Radar “learn this”',
  open_to_work: 'Open to work',
}

interface PostComposerProps {
  sources: ComposerSourceOption[]
  canPost: boolean
  connected: boolean
}

/**
 * Draft → edit → preview → Post. The draft is AI-suggested from one
 * source's facts and fact-locked; the server checks the final text again.
 * Nothing is posted until the Post button in the preview is clicked.
 */
export function PostComposer({ sources, canPost, connected }: PostComposerProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(false)
  const [usedSource, setUsedSource] = useState<string | null>(null)
  const source = sources.find((s) => s.id === usedSource) ?? null

  const draft = (): void => {
    if (!sourceId) return
    start(async () => {
      const r = await draftPostAction(sourceId)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setText(r.text)
      setUsedSource(sourceId)
      setPreview(false)
      if (!r.aiUsed) toast.message('Started from the plain facts (the AI draft was unavailable or failed the fact lock).')
    })
  }

  const post = (): void => {
    start(async () => {
      const r = await publishPostAction({ text, sourceId: source?.id ?? null, sourceKind: source?.kind ?? 'custom', confirmed: true })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Posted to LinkedIn.')
      setText('')
      setPreview(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="composer-source">Write about</Label>
          <NativeSelect id="composer-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {KIND_LABELS[s.kind]}: {s.label.slice(0, 90)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={draft} disabled={pending || !sourceId} data-testid="composer-draft">
          Draft
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="composer-text">Post text</Label>
        <Textarea
          id="composer-text"
          rows={8}
          maxLength={3000}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setPreview(false)
          }}
          placeholder="Draft from a source above, or write your own. Numbers and links must come from your profile."
        />
        <p className="text-right text-xs text-muted-foreground">{text.length.toLocaleString('en-US')} / 3,000</p>
      </div>
      {!preview ? (
        <Button type="button" size="sm" disabled={!text.trim()} onClick={() => setPreview(true)} data-testid="composer-preview">
          Preview
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border p-3" data-testid="composer-preview-box">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview: this exact text will be public on LinkedIn</div>
          <p className="whitespace-pre-line">{text}</p>
          {!connected ? (
            <p className="text-xs text-muted-foreground">
              <Link href="/settings/integrations#linkedin" className="underline">
                Connect LinkedIn
              </Link>{' '}
              with posting allowed to post from here, or copy the text and post it yourself.
            </p>
          ) : !canPost ? (
            <p className="text-xs text-muted-foreground">
              Posting is off.{' '}
              <Link href="/settings/integrations#linkedin" className="underline">
                Reconnect LinkedIn
              </Link>{' '}
              with “Allow posting” ticked.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={post} disabled={pending || !canPost} data-testid="composer-post">
              Post to LinkedIn
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(false)} disabled={pending}>
              Keep editing
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
