'use client'
import { plural } from '@/lib/ui/labels'
import { useState, useTransition } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { checkGoogleRatingAction } from '@/app/(authed)/companies/[id]/reputation-actions'
import { APP_NAME } from '@/lib/brand'
import type { PlaceRating } from '@/lib/reputation/places'

/**
 * Live Google rating — only when the user enabled Places. Shown with its
 * attributions and never stored (Google Maps Platform caching terms).
 */
export function GoogleRating({ companyId, capLeft }: { companyId: string; capLeft: number }) {
  const [place, setPlace] = useState<PlaceRating | null>(null)
  const [pending, start] = useTransition()
  const [left, setLeft] = useState(capLeft)

  const check = (): void => {
    start(async () => {
      const r = await checkGoogleRatingAction(companyId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setPlace(r.place)
      setLeft((n) => Math.max(0, n - 1))
    })
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={check} disabled={pending || left === 0}>
          <Star /> {pending ? 'Checking…' : 'Check Google rating'}
        </Button>
        <span className="text-xs text-muted-foreground">{plural(left, 'call')} left this month</span>
      </div>
      {place ? (
        <div className="space-y-2 rounded-md border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {place.name ?? 'Google'} · {place.rating !== null ? `${place.rating.toFixed(1)}/5` : 'no rating'}
              {place.count !== null ? ` (${place.count.toLocaleString('en-US')} reviews)` : ''}
            </span>
            {place.mapsUri ? (
              <a href={place.mapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Google Maps <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
          <ul className="space-y-2">
            {place.reviews.map((r, i) => (
              <li key={i} className="text-xs">
                <div className="text-muted-foreground">
                  {r.rating !== null ? `${r.rating}/5 · ` : ''}
                  {r.authorUri ? (
                    <a href={r.authorUri} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {r.author ?? 'Google user'}
                    </a>
                  ) : (
                    (r.author ?? 'Google user')
                  )}
                  {r.relativeTime ? ` · ${r.relativeTime}` : ''}
                </div>
                <p className="whitespace-pre-wrap">{r.text}</p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Ratings and reviews from Google. Not saved by {APP_NAME}.</p>
        </div>
      ) : null}
    </div>
  )
}
