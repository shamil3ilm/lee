'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, Briefcase, Building2, ChevronDown, ExternalLink, MapPin, Star, ThumbsDown, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  dismissLocalCompany,
  restoreLocalCompany,
  saveLocalCompany,
  watchCompanyCareers,
  watchCompanyJobs,
  type CompanyActionResult,
} from '@/app/(authed)/discoveries/company-actions'
import { DISMISS_REASON_LABELS, DISMISS_REASONS } from '@/lib/company-discovery/types'
import { cn } from '@/lib/utils'
import { ReachOutDialog } from './reach-out-dialog'
import { sourceTagLabel, type CompanyCardData } from './types'

/**
 * One company in Discovery › Companies: logo, place, industry, size, the
 * fit chips that explain its rank, and the actions (Watch jobs / Watch
 * careers page / Reach out / Save / Dismiss / Not relevant + reason).
 */

function chipTone(kind: string, warn?: boolean): 'warning' | 'success' | 'info' | 'neutral' {
  if (warn) return 'warning'
  if (kind === 'preferred' || kind === 'warm') return 'success'
  if (kind === 'hiring') return 'info'
  return 'neutral'
}

function Logo({ c }: { c: CompanyCardData }) {
  if (c.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small third-party logos (Wikimedia, GitHub), lazy and size-capped
    return <img src={c.logoUrl} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-md border bg-white object-contain" />
  }
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted text-sm font-semibold text-muted-foreground" aria-hidden="true">
      {c.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function CompanyCard({ c }: { c: CompanyCardData }) {
  const router = useRouter()
  const [pending, start] = useTransition()
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
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm" data-testid="company-card" data-company={c.name}>
      <div className="flex gap-3">
        <Logo c={c} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">
                {c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
              </h3>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {c.regionLabel ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden="true" />
                    {c.regionLabel}
                  </span>
                ) : null}
                {c.industries.length > 0 ? <span>{c.industries.slice(0, 3).join(' · ')}</span> : null}
                {c.sizeBand ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" aria-hidden="true" />
                    {c.sizeBand}
                  </span>
                ) : null}
                {c.stage ? <span>{c.stage}</span> : null}
              </p>
            </div>
            {c.fitScore !== null ? (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-sm font-semibold tabular-nums text-secondary-foreground" title="Company fit (0–100)" data-testid="company-fit">
                {c.fitScore}
              </span>
            ) : null}
          </div>
          {c.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p> : null}
          {c.chips.length > 0 ? (
            <ul className="flex flex-wrap gap-1 pt-1" aria-label="Why this rank">
              {c.chips.map((ch) => (
                <li key={`${ch.kind}-${ch.label}`}>
                  <Badge variant={chipTone(ch.kind, ch.warn)} className="font-normal" title={ch.points > 0 ? `+${ch.points}` : undefined}>
                    {ch.label}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="flex flex-wrap gap-x-3 pt-1 text-xs text-muted-foreground">
            {c.sourceTags.length > 0 ? <span>Found via {c.sourceTags.map(sourceTagLabel).join(', ')}</span> : null}
            {c.careersUrl ? (
              <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                {c.boardLabel ? `${c.boardLabel} board` : 'Careers page'}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
            {c.listedAt ? (
              <a href={c.listedAt} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                Listing
              </a>
            ) : null}
            {c.enrichStatus === 'pending' ? <span>Careers check queued</span> : null}
            {c.careersNote ? <span>{c.careersNote}</span> : null}
            {c.watch ? <span className="font-medium text-foreground">{c.watch === 'jobs' ? 'Watching its jobs' : 'Watching its careers page'}</span> : null}
            {c.tracked ? <span className="font-medium text-foreground">Speculative application tracked</span> : null}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dismissed ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => restoreLocalCompany(c.id), 'Restored')}>
            Restore
          </Button>
        ) : (
          <>
            {c.watchable ? (
              <Button size="sm" disabled={pending || c.watch === 'jobs'} onClick={() => act(() => watchCompanyJobs(c.id))} data-testid="watch-jobs">
                <Briefcase className="size-4" aria-hidden="true" />
                Watch jobs
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || c.watch === 'careers' || (!c.careersUrl && !c.website)}
                onClick={() => act(() => watchCompanyCareers(c.id))}
                data-testid="watch-careers"
              >
                <Bell className="size-4" aria-hidden="true" />
                Watch careers page
              </Button>
            )}
            <ReachOutDialog companyId={c.id} companyName={c.name} tracked={c.tracked} />
            {c.status !== 'saved' ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => saveLocalCompany(c.id), 'Saved')}>
                <Star className="size-4" aria-hidden="true" />
                Save
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" disabled={pending} aria-label={`Dismiss ${c.name}`} data-testid="company-dismiss-menu">
                  <X className="size-4" aria-hidden="true" />
                  Dismiss
                  <ChevronDown className="size-3" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => act(() => dismissLocalCompany(c.id, null), 'Dismissed')}>
                  <X className="size-4" aria-hidden="true" />
                  Dismiss
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                  <ThumbsDown className="size-3.5" aria-hidden="true" />
                  Not relevant because…
                </DropdownMenuLabel>
                {DISMISS_REASONS.map((r) => (
                  <DropdownMenuItem key={r} onSelect={() => act(() => dismissLocalCompany(c.id, r), 'Dismissed')}>
                    {DISMISS_REASON_LABELS[r]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {c.githubLogin ? (
          <a
            href={`https://github.com/${c.githubLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4')}
          >
            <Building2 className="size-3" aria-hidden="true" />
            GitHub
          </a>
        ) : null}
      </div>
    </li>
  )
}
