import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { LookingForView } from '@/lib/discovery/relevance/view'
import { searchPrefsHref } from '@/lib/ui/settings-links'

interface LookingForCardProps {
  view: LookingForView
  /** Pending role suggestions from the profile / master CV. */
  suggestionCount: number
  /** The page to come back to from Settings. */
  from?: string
}

/**
 * The lowest-priority Discovery notice once preferences are saved: one
 * line, "What you're looking for: Backend, Full-stack · Junior · GCC,
 * India · Remote worldwide", with Edit. (Unsaved preferences show the
 * defaults notice instead.)
 */
export function LookingForCard({ view, suggestionCount, from }: LookingForCardProps) {
  const parts = [
    view.roles.length > 0 ? view.roles.join(', ') : 'Any role',
    view.seniority.length > 0 ? view.seniority.join(', ') : 'Any level',
    [...view.regions, view.remote].join(', '),
    view.notice ? `Available ${view.notice}` : null,
  ].filter(Boolean)
  const summary = parts.join(' · ')
  return (
    <section
      aria-labelledby="looking-for-title"
      data-testid="looking-for"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm"
    >
      <h2 id="looking-for-title" className="shrink-0 text-xs font-semibold">
        What you’re looking for
      </h2>
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={summary}>
        {summary}
      </p>
      <span className="flex shrink-0 items-center gap-3 text-xs">
        {suggestionCount > 0 ? (
          <Link
            href={searchPrefsHref(from, 'role-suggestions')}
            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {suggestionCount} suggested role{suggestionCount === 1 ? '' : 's'}
          </Link>
        ) : null}
        <Link href={searchPrefsHref(from)} className="font-medium text-primary underline-offset-2 hover:underline">
          Edit
        </Link>
      </span>
    </section>
  )
}
