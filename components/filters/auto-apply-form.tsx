'use client'
import * as React from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { filterQuery, withQuery } from '@/lib/ui/filter-query'
import { useUrlFilters } from '@/components/filters/use-url-filters'

/** Inputs that debounce instead of applying on every change. */
const TYPED = new Set(['text', 'search', 'email', 'url', 'tel', 'number'])

function isTyped(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && TYPED.has(target.type)
}

/** Sorted, so a link that orders its params differently compares equal. */
function normalise(query: string): string {
  const params = [...new URLSearchParams(query).entries()].sort(([a], [b]) => a.localeCompare(b))
  return new URLSearchParams(params).toString()
}

export interface AutoApplyFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'action' | 'method' | 'onSubmit' | 'onChange'> {
  /** The page path the filters apply to, e.g. "/settings/logs". */
  action: string
  /** Accessible name of the search landmark, e.g. "Filter logs". */
  label: string
  /** Results summary announced politely after each apply, e.g. "12 events". */
  status?: string
  /** Shows a "Clear" link to this href while any filter is set. */
  clearHref?: string
  /** Values equal to their default are left out of the URL. */
  defaults?: Readonly<Record<string, string>>
  children?: React.ReactNode
}

/**
 * A GET filter form that applies itself: selects, checkboxes and radios
 * apply on change, text and search inputs after a 300 ms pause, and Enter
 * applies at once. The URL is the state (the server page reads
 * `searchParams`); without JavaScript it is a plain GET form with an Apply
 * button. The results count goes to a polite live region.
 */
export function AutoApplyForm({
  action,
  label,
  status,
  clearHref,
  defaults,
  className,
  children,
  ...props
}: AutoApplyFormProps) {
  const { searchParams, navigate, pending } = useUrlFilters()
  const formRef = React.useRef<HTMLFormElement>(null)
  const current = normalise(filterQuery(searchParams.entries(), { defaults }))
  // The query this form last pushed. When the URL changes for another
  // reason (Clear, Back, a link), the form remounts so its uncontrolled
  // fields pick up the new defaults from the server render.
  const [pushed, setPushed] = React.useState(current)
  const [generation, setGeneration] = React.useState(0)
  const [seen, setSeen] = React.useState(current)
  if (current !== seen) {
    setSeen(current)
    if (current !== pushed) {
      setPushed(current)
      setGeneration((g) => g + 1)
    }
  }

  const apply = (debounce: boolean): void => {
    navigate(
      () => {
        const form = formRef.current
        if (!form) return withQuery(action, current)
        const query = filterQuery(new FormData(form).entries(), { defaults })
        setPushed(normalise(query))
        return withQuery(action, query)
      },
      { debounce },
    )
  }

  return (
    <form
      {...props}
      key={generation}
      ref={formRef}
      method="get"
      action={action}
      role="search"
      aria-label={label}
      aria-busy={pending || undefined}
      className={className}
      onChange={(e) => apply(isTyped(e.target))}
      onSubmit={(e) => {
        e.preventDefault()
        apply(false)
      }}
    >
      {/* Children come from a server page as an array; give them stable keys. */}
      {React.Children.toArray(children)}
      {clearHref && current ? (
        <Link
          href={clearHref}
          scroll={false}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-end text-muted-foreground')}
        >
          Clear
        </Link>
      ) : null}
      <noscript>
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Apply
        </button>
      </noscript>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? '' : status}
      </p>
    </form>
  )
}
