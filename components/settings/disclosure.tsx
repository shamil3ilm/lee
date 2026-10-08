'use client'
import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

interface DisclosureProps {
  /** The toggle's text ("Details", a site name …). */
  label: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  buttonClassName?: string
}

/**
 * A small "show more" toggle: a button with a chevron and `aria-expanded`
 * that reveals a region below it. Replaces native `<details>` triangles in
 * Settings (audit S10) until a shared Disclosure primitive lands.
 */
export function Disclosure({ label, children, defaultOpen = false, className, buttonClassName }: DisclosureProps) {
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground',
          focusRing,
          buttonClassName,
        )}
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        {label}
      </button>
      <div id={id} hidden={!open} className="mt-1.5">
        {children}
      </div>
    </div>
  )
}
