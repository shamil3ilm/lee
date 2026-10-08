'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Trash2 } from 'lucide-react'
import { removeSource } from '@/app/(authed)/settings/sources/actions'
import { Button } from '@/components/ui/button'

export interface WatchItem {
  id: string
  name: string
  url: string
  reason: string | null
}

/**
 * Settings › Sources › "Check these yourself": careers pages and portals
 * lee may not fetch (their terms or robots.txt forbid it, or there's no
 * public feed). Just a link and the reason — no request is ever made.
 */
export function WatchListPanel({ items }: { items: WatchItem[] }) {
  const [isPending, startTransition] = useTransition()
  if (items.length === 0) return null

  const remove = (id: string): void => {
    startTransition(async () => {
      const r = await removeSource(id)
      if ('success' in r) toast.success('Removed from the watch list')
      else toast.error(r.error)
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        lee doesn&apos;t fetch these sites: their terms or robots.txt don&apos;t allow automated access, or there&apos;s no
        public feed. Open them now and then; where the site sends job alerts, set one up and lee picks the jobs up from your
        email.
      </p>
          <ul className="divide-y rounded-md border text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {item.name} <ExternalLink className="size-3" />
                  </a>
                  {item.reason ? <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p> : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0"
                  disabled={isPending}
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name} from the watch list`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
    </div>
  )
}
