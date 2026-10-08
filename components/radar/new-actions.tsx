'use client'
import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, Bookmark, BookmarkCheck, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { openWhatsNewAction, watchWhatsNewAction, type NewActionResult } from '@/app/(authed)/radar/new/actions'

interface NewActionsProps {
  id: string
  name: string
  watched: boolean
  /** The user's own Radar entry for it, once saved or opened. */
  entryId: string | null
}

/** Watch this · Save · Brief & learn on a What's new card. */
export function NewActions({ id, name, watched, entryId }: NewActionsProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<NewActionResult>, then?: (entryId: string) => void): void => {
    start(async () => {
      const r = await fn()
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      if (r.message) toast.success(r.message)
      if (then && r.entryId) then(r.entryId)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || watched}
        onClick={() => run(() => watchWhatsNewAction(id))}
        aria-label={watched ? `Watching ${name}` : `Watch ${name}`}
      >
        {watched ? <BellRing /> : <Bell />}
        {watched ? 'Watching' : 'Watch this'}
      </Button>
      {entryId ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/radar/${entryId}`} aria-label={`Open ${name} in your Radar`}>
            <BookmarkCheck />
            In your Radar
          </Link>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => openWhatsNewAction(id, true))} aria-label={`Save ${name}`}>
          <Bookmark />
          Save
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => openWhatsNewAction(id, false), (e) => router.push(`/radar/${e}`))}
        aria-label={`Brief and learn ${name}`}
      >
        <FileText />
        Brief &amp; learn
      </Button>
    </div>
  )
}
