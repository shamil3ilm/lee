'use client'
import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  removeReputationRatingAction,
  saveReputationRatingAction,
} from '@/app/(authed)/companies/[id]/reputation-actions'
import type { UserRating } from '@/lib/reputation/types'

const SITE_LABELS: Record<UserRating['site'], string> = {
  glassdoor: 'Glassdoor',
  indeed: 'Indeed',
  ambitionbox: 'AmbitionBox',
  comparably: 'Comparably',
  kununu: 'Kununu',
  blind: 'Blind',
  other: 'Other',
}

const US_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

interface Props {
  companyId: string
  ratings: UserRating[]
}

/** The user's own notes from review sites they read (lee never fetches them). */
export function ReputationRatings({ companyId, ratings }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()

  const onSubmit = (formData: FormData): void => {
    start(async () => {
      const r = await saveReputationRatingAction(companyId, formData)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Saved.')
      formRef.current?.reset()
      router.refresh()
    })
  }

  const onRemove = (site: string): void => {
    start(async () => {
      const r = await removeReputationRatingAction(companyId, site)
      if ('error' in r) toast.error(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {ratings.length > 0 ? (
        <ul className="space-y-2">
          {ratings.map((r) => (
            <li key={r.site} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">
                  {SITE_LABELS[r.site]} · {r.rating.toFixed(1)}/5
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
                    >
                      Link <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                {r.summary ? <p className="whitespace-pre-wrap text-xs text-foreground/80">{r.summary}</p> : null}
                <div className="text-xs text-muted-foreground">Recorded {US_DAY.format(new Date(r.recordedAt))}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${SITE_LABELS[r.site]} rating`}
                disabled={pending}
                onClick={() => onRemove(r.site)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form ref={formRef} action={onSubmit} className="grid gap-2 sm:grid-cols-[1fr_6rem]">
        <div className="space-y-1">
          <Label htmlFor="rep-site">Site</Label>
          <Select name="site" defaultValue="glassdoor">
            <SelectTrigger id="rep-site">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SITE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rep-rating">Rating</Label>
          <Input id="rep-rating" name="rating" type="number" min={1} max={5} step={0.1} required placeholder="3.8" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="rep-url">Link (optional)</Label>
          <Input id="rep-url" name="url" type="url" placeholder="https://…" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="rep-summary">What you read</Label>
          <Textarea
            id="rep-summary"
            name="summary"
            rows={3}
            maxLength={1000}
            placeholder="e.g. Several reviews mention salary delays and visa renewals handled late."
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            Save rating
          </Button>
        </div>
      </form>
    </div>
  )
}
