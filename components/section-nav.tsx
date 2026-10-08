'use client'
import { useEffect, useState } from 'react'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

export interface SectionLink {
  /** The target element's id (without `#`). */
  id: string
  label: string
}

/**
 * Class for every section a `SectionNav` points at: the sticky app header
 * (56px) plus the nav row itself, so a jump never hides the heading.
 */
export const SECTION_ANCHOR = 'scroll-mt-28'

interface SectionNavProps {
  sections: readonly SectionLink[]
  /** Accessible name, e.g. "On this page". */
  label?: string
  className?: string
}

/**
 * Sticky in-page anchor chips under the page header ("Overview · Timeline ·
 * Documents …") with scroll-spy: the section nearest the top is marked
 * current. Plain `#id` links, so they work before hydration and with the
 * keyboard; on phones the row scrolls sideways instead of wrapping.
 */
export function SectionNav({ sections, label = 'On this page', className }: SectionNavProps) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null)
  const ids = sections.map((s) => s.id).join('|')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = ids
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        // The first section (in page order) that is in the band wins.
        const first = els.find((el) => visible.has(el.id))
        if (first) setActive(first.id)
      },
      // A band from just under the sticky header to 55% down the viewport.
      { rootMargin: '-112px 0px -45% 0px', threshold: 0 },
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [ids])

  if (sections.length < 2) return null
  return (
    <nav
      aria-label={label}
      data-testid="section-nav"
      className={cn(
        'sticky top-14 z-10 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8',
        className,
      )}
    >
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const current = active === s.id
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={current ? 'location' : undefined}
                onClick={() => setActive(s.id)}
                className={cn(
                  'inline-flex h-8 items-center rounded-md px-3 text-sm transition-colors',
                  current
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  focusRing,
                )}
              >
                {s.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
