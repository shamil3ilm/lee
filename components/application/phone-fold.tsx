'use client'
import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

interface PhoneFoldProps {
  /** What the folded card is, e.g. "Job description". */
  label: string
  children: React.ReactNode
}

/**
 * Folds a secondary card on phones (below `md`) to a one-line button, so
 * a long detail page shows its primary content first. From `md` up the card
 * renders as is and the button is hidden. Pure CSS for the default state:
 * no layout shift on hydration.
 */
export function PhoneFold({ label, children }: PhoneFoldProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-left text-sm font-semibold md:hidden',
          open && 'mb-2',
          focusRing,
        )}
      >
        {label}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden="true" />
      </button>
      <div id={id} className={cn(!open && 'max-md:hidden')}>
        {children}
      </div>
    </div>
  )
}
