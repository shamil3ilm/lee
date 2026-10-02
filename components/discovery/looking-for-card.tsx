import Link from 'next/link'
import { Filter, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LookingForView } from '@/lib/discovery/relevance/view'
import { APP_NAME } from '@/lib/brand'

interface LookingForCardProps {
  view: LookingForView
  /** Pending role suggestions from the profile / master CV. */
  suggestionCount: number
  /** Profile and master CV too thin for good suggestions. */
  sparse: boolean
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {items.map((i) => (
        <Badge key={i} variant="neutral">
          {i}
        </Badge>
      ))}
    </div>
  )
}

/**
 * Compact "What you're looking for" card at the top of Discovery. With no
 * preferences saved it is a prominent prompt instead: nothing is filtered
 * until the user says what they want.
 */
export function LookingForCard({ view, suggestionCount, sparse }: LookingForCardProps) {
  if (!view.active) {
    return (
      <section
        aria-labelledby="looking-for-title"
        className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <h2 id="looking-for-title" className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="size-4" aria-hidden="true" />
            Tell {APP_NAME} what you’re looking for
          </h2>
          <p className="text-sm text-muted-foreground">
            Nothing is filtered yet, so every posting from your sources lands here. Set target roles, seniority and
            locations to hide the rest{sparse ? ', and import your CV so suggestions and scores have something to go on' : ''}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/settings/profile#search-preferences">Set preferences</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/profile">Import CV</Link>
          </Button>
        </div>
      </section>
    )
  }
  return (
    <section aria-labelledby="looking-for-title" className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="looking-for-title" className="text-sm font-semibold">
          What you’re looking for
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {suggestionCount > 0 ? (
            <Link href="/settings/profile#role-suggestions" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {suggestionCount} suggested role{suggestionCount === 1 ? '' : 's'}
            </Link>
          ) : null}
          <Link href="/settings/profile#search-preferences" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Edit
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Chips label="Roles" items={view.roles.length > 0 ? view.roles : ['Any']} />
        <Chips label="Level" items={view.seniority.length > 0 ? view.seniority : ['Any']} />
        <Chips label="Where" items={[...view.regions, view.remote]} />
        {view.notice ? <Chips label="Available" items={[view.notice]} /> : null}
      </div>
    </section>
  )
}
