'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bookmark, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { checkHiringPostsNowAction, rotateCaptureKeyAction, setHiringPostsAction } from '@/app/(authed)/settings/linkedin/actions'

/** Turn reading LinkedIn notification emails on or off, and read them now. */
export function HiringPostsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, startTransition] = useTransition()

  const toggle = (next: boolean): void => {
    setOn(next)
    startTransition(async () => {
      const r = await setHiringPostsAction(next)
      if (!r.ok) {
        setOn(!next)
        toast.error(r.error)
        return
      }
      toast.success(next ? 'lee will read your LinkedIn post emails on every discovery run' : 'Stopped reading LinkedIn post emails')
      router.refresh()
    })
  }

  const check = (): void => {
    startTransition(async () => {
      const r = await checkHiringPostsNowAction()
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const parts = [`${r.found} hiring post${r.found === 1 ? '' : 's'} found`, `${r.added} new`]
      if (r.unreadable > 0) parts.push(`${r.unreadable} email${r.unreadable === 1 ? '' : 's'} unreadable`)
      toast.success(parts.join(' · '))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Switch
        checked={on}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
        label="Read hiring posts from my LinkedIn emails"
        description="Gmail, read-only; only emails Google verified as sent by linkedin.com."
        data-testid="hiring-posts-toggle"
      />
      <Button size="sm" variant="outline" onClick={check} disabled={pending || !on} data-testid="hiring-posts-check">
        <RefreshCw className={pending ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
        Check now
      </Button>
    </div>
  )
}

/**
 * The draggable "Send to lee" bookmark. React blocks `javascript:` URLs in
 * href, so the address is set on the element directly; clicking it here
 * (on lee itself) does nothing.
 */
export function BookmarkletLink({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    ref.current?.setAttribute('href', href)
  }, [href])

  const rotate = (): void => {
    startTransition(async () => {
      const r = await rotateCaptureKeyAction()
      if (!r.ok) toast.error(r.error)
      else {
        toast.success('New bookmarklet ready. Drag it to your bookmarks bar again; the old one no longer works.')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        ref={ref}
        className="inline-flex h-9 cursor-grab items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 text-sm font-medium text-primary"
        onClick={(e) => {
          e.preventDefault()
          toast.info('Drag this button to your bookmarks bar, then click it on a post you have selected.')
        }}
        data-testid="send-to-lee-bookmarklet"
        aria-label="Send to lee bookmarklet: drag it to your bookmarks bar"
      >
        <Bookmark className="size-4" aria-hidden="true" />
        Send to lee
      </a>
      <Button size="sm" variant="ghost" onClick={rotate} disabled={pending}>
        Make a new one (revokes the old)
      </Button>
    </div>
  )
}
