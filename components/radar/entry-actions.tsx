'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark, BookmarkCheck, BellOff, Check, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { muteWatchTermAction, setEntryFlagAction } from '@/app/(authed)/radar/actions'

interface EntryActionsProps {
  entryId: string
  name: string
  read: boolean
  saved: boolean
  terms: Array<{ id: string; label: string }>
}

/** Mark read, save, and mute the term that matched — on a feed card or the entry page. */
export function EntryActions({ entryId, name, read, saved, terms }: EntryActionsProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ success: true; message?: string } | { error: string }>): void => {
    start(async () => {
      const r = await fn()
      if ('error' in r) toast.error(r.error)
      else {
        if (r.message) toast.success(r.message)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => setEntryFlagAction(entryId, 'read', !read))}
        aria-label={read ? `Mark ${name} as new` : `Mark ${name} as read`}
      >
        {read ? <Undo2 /> : <Check />}
        {read ? 'Mark new' : 'Mark read'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => setEntryFlagAction(entryId, 'saved', !saved))}
        aria-pressed={saved}
        aria-label={saved ? `Unsave ${name}` : `Save ${name}`}
      >
        {saved ? <BookmarkCheck /> : <Bookmark />}
        {saved ? 'Saved' : 'Save'}
      </Button>
      {terms.map((t) => (
        <Button
          key={t.id}
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => muteWatchTermAction(t.id, true))}
          aria-label={`Mute the term ${t.label}`}
        >
          <BellOff />
          Mute “{t.label}”
        </Button>
      ))}
    </div>
  )
}
