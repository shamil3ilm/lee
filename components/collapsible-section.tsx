'use client'
import { isValidElement, useEffect, useId, useState, useSyncExternalStore } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { focusRing } from '@/components/ui/focus-ring'
import { BELOW_MD_QUERY, useMediaQuery } from '@/lib/ui/media'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  /** Anchor id for in-page links (`SectionNav`). */
  id?: string
  title: string
  /**
   * A Lucide icon component (from client components) or a rendered icon
   * element (from server components, which cannot pass functions).
   */
  icon?: LucideIcon | React.ReactElement
  /** Count chip after the title (e.g. number of sources). */
  count?: number
  /** One line under the title that stays visible while collapsed ("3 on · 1 failing"). */
  summary?: React.ReactNode
  /** Extra controls on the header row (kept outside the toggle button). */
  actions?: React.ReactNode
  defaultOpen?: boolean
  /**
   * Collapsed by default below `md` (phones), open from `md` up. Rendered
   * with CSS first, so there is no layout shift on hydration.
   */
  collapseOnMobile?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * A titled section that folds to its header and a one-line status summary.
 * Used to cut very long pages (Settings › Sources, Application detail on
 * phones) into scannable groups. The header is a real `<button>` with
 * `aria-expanded`; no native `<details>` triangle.
 */
export function CollapsibleSection({
  id,
  title,
  icon: Icon,
  count,
  summary,
  actions,
  defaultOpen = true,
  collapseOnMobile = false,
  className,
  children,
}: CollapsibleSectionProps) {
  const bodyId = useId()
  const mobile = useMediaQuery(BELOW_MD_QUERY)
  // null = "the default for this viewport" until the user toggles.
  const [choice, setChoice] = useState<boolean | null>(null)
  // A deep link or an in-page link to this section (`#id`) opens it.
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '')
  const targeted = id !== undefined && hash === `#${id}`
  useEffect(() => {
    if (!id) return
    const onHash = (): void => {
      if (window.location.hash === `#${id}`) setChoice(true)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [id])
  const open = choice ?? (targeted ? true : collapseOnMobile && mobile ? false : defaultOpen)
  const cssDefault = choice === null && !targeted && collapseOnMobile && defaultOpen

  return (
    <section id={id} aria-labelledby={`${bodyId}-title`} className={cn('scroll-mt-28 rounded-xl border bg-card text-card-foreground', className)}>
      <div className="flex items-start gap-2 p-4">
        <h2 className="m-0 flex min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          suppressHydrationWarning
          onClick={() => setChoice(!open)}
          className={cn('-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-md p-1 text-left', focusRing)}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
              cssDefault ? 'max-md:-rotate-90' : !open && '-rotate-90',
            )}
          />
          <span className="min-w-0 flex-1">
            <span id={`${bodyId}-title`} className="flex items-center gap-2 text-sm font-semibold leading-snug">
              {isValidElement(Icon) ? (
                <span className="shrink-0 text-muted-foreground [&>svg]:size-4" aria-hidden="true">
                  {Icon}
                </span>
              ) : Icon ? (
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : null}
              <span className="min-w-0">{title}</span>
              {typeof count === 'number' ? (
                <span className="rounded-md bg-secondary px-1.5 text-[11px] font-medium tabular-nums text-secondary-foreground">
                  {count}
                </span>
              ) : null}
            </span>
            {summary ? <span className="mt-0.5 block text-xs text-muted-foreground">{summary}</span> : null}
          </span>
        </button>
        </h2>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div
        id={bodyId}
        className={cn('px-4 pb-4', cssDefault ? 'max-md:hidden' : !open && 'hidden')}
        data-state={open ? 'open' : 'closed'}
        suppressHydrationWarning
      >
        {children}
      </div>
    </section>
  )
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function readHash(): string {
  return window.location.hash
}
