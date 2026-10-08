import { cn } from '@/lib/utils'
import { focusRing } from '@/components/ui/focus-ring'

/** Every layout's main landmark carries this id (and tabIndex -1, so it takes focus). */
export const MAIN_CONTENT_ID = 'main'

/**
 * "Skip to content" (WCAG 2.4.1): the first Tab stop on every page,
 * visually hidden until focused, then a primary chip in the top-left corner.
 * Rendered once by the root layout; each layout's <main> has the target id.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg',
        focusRing,
      )}
    >
      Skip to content
    </a>
  )
}
