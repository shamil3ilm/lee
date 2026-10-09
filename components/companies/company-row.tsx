'use client'
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, Briefcase, ChevronDown, Eye, MapPin, MoreHorizontal, RotateCcw, Sparkles, Star, ThumbsDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { focusRing } from '@/components/ui/focus-ring'
import {
  dismissLocalCompany,
  restoreLocalCompany,
  saveLocalCompany,
  watchLocalCompany,
  type CompanyActionResult,
} from '@/app/(authed)/discoveries/company-actions'
import { DISMISS_REASON_LABELS, DISMISS_REASONS } from '@/lib/company-discovery/types'
import { scoreBand } from '@/lib/discovery/match/blend'
import { cn } from '@/lib/utils'
import { CompanyDetails } from './company-details'
import { GrowthChip } from './growth-chip'
import type { CompanyCardData } from './types'

/**
 * One company in Discovery › Companies, answering one question: is it
 * worth my time? Name and website, where it is, fit, growth, open roles and
 * whether you watch it; three actions (Watch · Not interested · Open
 * careers). Everything else (why it ranks, sources, signals, Reach out)
 * folds out under "Details". On phones the actions sit in a full-width row
 * at the bottom of the card, in thumb reach.
 */

const FIT_VARIANT = { strong: 'success', good: 'info', fair: 'warning', weak: 'neutral' } as const

function Logo({ c }: { c: CompanyCardData }) {
  if (c.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small third-party logos (Wikimedia, GitHub), lazy and size-capped
    return <img src={c.logoUrl} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-md border bg-white object-contain" />
  }
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-sm font-semibold text-muted-foreground" aria-hidden="true">
      {c.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

function hiringText(c: CompanyCardData): string | null {
  if (c.openRoles !== null && c.openRoles > 0) return `${c.openRoles} open role${c.openRoles === 1 ? '' : 's'}`
  if (c.boardLabel) return c.openRoles === 0 ? 'No openings now' : `${c.boardLabel} board`
  if (c.careersUrl) return 'Careers page'
  return null
}

interface CompanyRowProps {
  c: CompanyCardData
  selected: boolean
  onSelect: (checked: boolean) => void
}

export function CompanyRow({ c, selected, onSelect }: CompanyRowProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const act = (fn: () => Promise<CompanyActionResult>, ok?: string): void => {
    start(async () => {
      const r = await fn()
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(r.message ?? ok ?? 'Done')
        router.refresh()
      }
    })
  }
  const dismissed = c.status === 'dismissed'
  const hiring = hiringText(c)
  const domain = c.domain ?? c.website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') ?? null
  const careersHref = c.careersUrl ?? c.website
  const canWatch = !!(c.careersUrl || c.website || c.watchable)

  return (
    <li className="rounded-xl border bg-card shadow-sm" data-testid="company-card" data-company={c.name} aria-busy={pending || undefined}>
      <div className="lg:flex lg:items-center">
      <div className="flex min-w-0 flex-1 gap-3 p-3 sm:p-4">
        <div className="flex shrink-0 items-start gap-3 pt-1">
          <Checkbox checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${c.name}`} data-testid="company-select" />
          <Logo c={c} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight">{c.name}</h3>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {domain && c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-4 hover:underline">
                    {domain}
                  </a>
                ) : null}
                {c.locationChain ? <span className="truncate" data-testid="company-location">{c.locationChain}</span> : null}
              </p>
            </div>
            {c.fitScore !== null ? (
              <Badge
                variant={FIT_VARIANT[scoreBand(c.fitScore)]}
                className="shrink-0 tabular-nums"
                title="Company fit: how well it matches your regions, roles, skills and preferences (0–100)"
                data-testid="company-fit"
              >
                Fit {c.fitScore}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <GrowthChip g={c.growth} />
            {hiring ? (
              <Badge variant={c.openRoles ? 'info' : 'neutral'} className="gap-1 font-normal" data-testid="company-hiring">
                <Briefcase className="size-3" aria-hidden="true" />
                {hiring}
              </Badge>
            ) : null}
            {c.watch ? (
              <Badge variant="success" className="gap-1 font-normal" data-testid="company-watching">
                <Eye className="size-3" aria-hidden="true" />
                {c.watch === 'jobs' ? 'Watching its jobs' : 'Watching its careers page'}
              </Badge>
            ) : c.status === 'saved' ? (
              <Badge variant="neutral" className="gap-1 font-normal">
                <Star className="size-3" aria-hidden="true" />
                Saved
              </Badge>
            ) : null}
            {c.hiddenGem ? (
              <Badge variant="success" className="gap-1 font-normal" data-testid="under-the-radar">
                <Sparkles className="size-3" aria-hidden="true" />
                Under the radar
              </Badge>
            ) : null}
            {c.foundVia ? (
              <Badge
                variant="neutral"
                className="gap-1 font-normal"
                data-testid="company-provenance"
                title={`Only ${c.foundVia === 'register' ? 'a company register' : c.foundVia === 'map' ? 'OpenStreetMap' : 'OpenStreetMap and a company register'} listed it. ${c.hires.why}.`}
              >
                <MapPin className="size-3" aria-hidden="true" />
                Found via {c.foundVia === 'map and register' ? 'map/register' : c.foundVia}
              </Badge>
            ) : null}
            {c.tracked ? <Badge variant="neutral" className="font-normal">Speculative application tracked</Badge> : null}
            <button
              type="button"
              className={cn('ml-auto inline-flex min-h-6 items-center gap-0.5 rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground', focusRing)}
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((v) => !v)}
              data-testid="company-details-toggle"
            >
              {open ? 'Less' : 'Details'}
              <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 border-t px-3 py-2 sm:flex sm:flex-wrap sm:px-4 lg:flex-none lg:flex-nowrap lg:border-t-0 lg:py-0 lg:pl-0">
        <div className="contents">
          {dismissed ? (
            <Button size="sm" variant="outline" className="col-span-4 h-10 sm:h-8" disabled={pending} onClick={() => act(() => restoreLocalCompany(c.id), 'Restored')}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Restore
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="h-10 sm:h-8"
                variant={c.watch ? 'outline' : 'default'}
                disabled={pending || !!c.watch || !canWatch}
                onClick={() => act(() => watchLocalCompany(c.id))}
                data-testid="company-watch"
                title={c.watchable ? 'Poll its job board daily' : 'Check its careers page weekly'}
              >
                <Bell className="size-4" aria-hidden="true" />
                {c.watch ? 'Watching' : 'Watch'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-10 sm:h-8" disabled={pending} aria-label={`Not interested in ${c.name}`} data-testid="company-dismiss-menu">
                    <ThumbsDown className="size-4" aria-hidden="true" />
                    <span className="max-sm:sr-only">Not interested</span>
                    <span className="sm:hidden" aria-hidden="true">
                      Pass
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => act(() => dismissLocalCompany(c.id, null), 'Dismissed')}>Not interested</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Because…</DropdownMenuLabel>
                  {DISMISS_REASONS.map((r) => (
                    <DropdownMenuItem key={r} onSelect={() => act(() => dismissLocalCompany(c.id, r), 'Dismissed')}>
                      {DISMISS_REASON_LABELS[r]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {careersHref ? (
                <Button asChild size="sm" variant="ghost" className="h-10 sm:h-8">
                  <a href={careersHref} target="_blank" rel="noopener noreferrer" data-testid="company-careers">
                    <span className="max-sm:sr-only">{c.careersUrl ? 'Open careers' : 'Website'}</span>
                    <span className="sm:hidden" aria-hidden="true">
                      {c.careersUrl ? 'Careers' : 'Website'}
                    </span>
                  </a>
                </Button>
              ) : (
                <span aria-hidden="true" />
              )}
            </>
          )}
        </div>
        <div className="flex items-center justify-end sm:ml-auto">
          {!dismissed && c.status !== 'saved' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="size-10 p-0 sm:size-8" aria-label={`More actions for ${c.name}`} disabled={pending}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => act(() => saveLocalCompany(c.id), 'Saved')}>
                  <Star className="size-4" aria-hidden="true" />
                  Save for later
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      </div>
      {open ? (
        <div id={detailsId} className="border-t px-3 py-3 sm:px-4" data-testid="company-details">
          <CompanyDetails c={c} />
        </div>
      ) : null}
    </li>
  )
}
