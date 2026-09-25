'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { relativeFromNow } from '@/lib/ui/date'
import {
  saveDiscovery,
  dismissDiscovery,
  saveCompanyDiscovery,
  dismissCompanyDiscovery,
} from '@/app/(authed)/discoveries/actions'
import type {
  NormalizedJob,
  NormalizedCompany,
} from '@/lib/discovery/adapters/types'

export interface DiscoveryRowJob {
  id: string
  status: string
  matchScore: number | null
  benefitsScore: number | null
  createdAt: string
  sourceName: string
  normalized: NormalizedJob
  reasoning: DiscoveryReasoning | null
}

export interface DiscoveryRowCompany {
  id: string
  status: string
  matchScore: number | null
  createdAt: string
  sourceName: string
  normalized: NormalizedCompany
  reasoning: DiscoveryReasoning | null
}

export interface DiscoveryReasoning {
  summary?: string
  strengths?: string[]
  red_flags?: string[]
  stack_overlap?: string[]
  stack_gaps?: string[]
  [k: string]: unknown
}

function scoreVariant(score: number | null): BadgeProps['variant'] {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 70) return 'emerald'
  if (score >= 40) return 'blue'
  return 'rose'
}

function scoreLabel(score: number | null, prefix: string): string {
  if (score === null || score === undefined) return `${prefix} —`
  return `${prefix} ${score}`
}

// ---------- Job row -----------------------------------------------------

interface JobDiscoveryRowProps {
  item: DiscoveryRowJob
  selected?: boolean
  onToggleSelect?: () => void
}

export function JobDiscoveryRow({ item, selected, onToggleSelect }: JobDiscoveryRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const n = item.normalized
  const isActionable = item.status === 'new'

  const handleSave = (): void => {
    startTransition(async () => {
      const result = await saveDiscovery(item.id)
      if ('success' in result) toast.success('Saved to pipeline')
      else if ('conflict' in result) {
        // v9 — discovery drifted between viewing and clicking (dismissed
        // in another tab, etc). Toast + refresh so the stale row disappears.
        toast(result.message)
        router.refresh()
      } else toast.error(result.error)
    })
  }

  const handleDismiss = (): void => {
    startTransition(async () => {
      const result = await dismissDiscovery(item.id)
      if ('success' in result) toast.success('Dismissed')
      else if ('error' in result) toast.error(result.error)
      else toast(result.message)
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        {/*
          Mobile: content stacks (checkbox + meta on top, actions row below)
          so long titles never push Save/Dismiss off-screen. sm+: original
          side-by-side layout is preserved.
        */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          {isActionable && onToggleSelect ? (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={onToggleSelect}
              aria-label={`Select ${n.title}`}
              className="mt-1 size-4 shrink-0 rounded border-input"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{n.title}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="truncate text-sm text-muted-foreground">{n.companyName}</span>
              {n.location ? (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="truncate text-xs text-muted-foreground">{n.location}</span>
                </>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={scoreVariant(item.matchScore)}>
                {scoreLabel(item.matchScore, 'Match')}
              </Badge>
              <Badge variant={scoreVariant(item.benefitsScore)}>
                {scoreLabel(item.benefitsScore, 'Benefits')}
              </Badge>
              <Badge variant="neutral">{item.sourceName}</Badge>
              {n.remoteType && n.remoteType !== 'unknown' ? (
                <Badge variant="slate">{n.remoteType}</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {relativeFromNow(item.createdAt)}
              </span>
            </div>
          </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {n.applyUrl ? (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Open source"
              >
                <a href={n.applyUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            ) : null}
            {isActionable ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  disabled={isPending}
                >
                  Dismiss
                </Button>
              </>
            ) : (
              <Badge variant={item.status === 'saved' ? 'emerald' : 'neutral'}>
                {item.status}
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {expanded ? (
          <ReasoningBlock reasoning={item.reasoning} techStack={n.techStack} />
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------- Company row -------------------------------------------------

export function CompanyDiscoveryRow({ item }: { item: DiscoveryRowCompany }) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const n = item.normalized
  const isActionable = item.status === 'new'

  const handleSave = (): void => {
    startTransition(async () => {
      const result = await saveCompanyDiscovery(item.id)
      if ('success' in result) toast.success('Added to watchlist')
      else if ('conflict' in result) {
        toast(result.message)
        router.refresh()
      } else toast.error(result.error)
    })
  }

  const handleDismiss = (): void => {
    startTransition(async () => {
      const result = await dismissCompanyDiscovery(item.id)
      if ('success' in result) toast.success('Dismissed')
      else if ('error' in result) toast.error(result.error)
      else toast(result.message)
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{n.name}</span>
              {n.domain ? (
                <Link
                  href={n.website ?? `https://${n.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {n.domain}
                </Link>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={scoreVariant(item.matchScore)}>
                {scoreLabel(item.matchScore, 'Match')}
              </Badge>
              {n.size ? <Badge variant="slate">{n.size}</Badge> : null}
              {n.stage ? <Badge variant="violet">{n.stage.replace(/_/g, ' ')}</Badge> : null}
              <Badge variant="neutral">{item.sourceName}</Badge>
              <span className="text-xs text-muted-foreground">
                {relativeFromNow(item.createdAt)}
              </span>
            </div>
            {item.reasoning?.summary ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                {item.reasoning.summary}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {isActionable ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  Add to watchlist
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  disabled={isPending}
                >
                  Dismiss
                </Button>
              </>
            ) : (
              <Badge variant={item.status === 'saved' ? 'emerald' : 'neutral'}>
                {item.status}
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {expanded ? (
          <ReasoningBlock reasoning={item.reasoning} techStack={n.techStack} />
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------- Shared reasoning block -------------------------------------

function ReasoningBlock({
  reasoning,
  techStack,
}: {
  reasoning: DiscoveryReasoning | null
  techStack?: string[]
}) {
  if (!reasoning && (!techStack || techStack.length === 0)) {
    return (
      <div className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Not yet scored. Discovery will re-score on the next cycle.
      </div>
    )
  }
  return (
    <div className="mt-3 grid gap-3 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-2">
      {reasoning?.summary ? (
        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <Sparkles className="size-3.5 text-muted-foreground" />
            Reasoning
          </div>
          <p className="text-muted-foreground">{reasoning.summary}</p>
        </div>
      ) : null}
      {reasoning?.strengths && reasoning.strengths.length > 0 ? (
        <div>
          <div className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">
            Strengths
          </div>
          <ul className="space-y-1">
            {reasoning.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reasoning?.red_flags && reasoning.red_flags.length > 0 ? (
        <div>
          <div className="mb-1 font-semibold text-rose-700 dark:text-rose-400">
            Red flags
          </div>
          <ul className="space-y-1">
            {reasoning.red_flags.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reasoning?.stack_overlap && reasoning.stack_overlap.length > 0 ? (
        <div className="sm:col-span-2">
          <div className="mb-1 font-semibold">Stack overlap</div>
          <div className="flex flex-wrap gap-1">
            {reasoning.stack_overlap.map((t) => (
              <Badge key={t} variant="emerald">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {reasoning?.stack_gaps && reasoning.stack_gaps.length > 0 ? (
        <div className="sm:col-span-2">
          <div className="mb-1 font-semibold">Stack gaps</div>
          <div className="flex flex-wrap gap-1">
            {reasoning.stack_gaps.map((t) => (
              <Badge key={t} variant="rose">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {(!reasoning?.stack_overlap || reasoning.stack_overlap.length === 0) &&
      techStack &&
      techStack.length > 0 ? (
        <div className="sm:col-span-2">
          <div className="mb-1 font-semibold">Tech stack</div>
          <div className="flex flex-wrap gap-1">
            {techStack.map((t) => (
              <Badge key={t} variant="slate">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
