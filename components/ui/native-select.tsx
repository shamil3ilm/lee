import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

/**
 * A native <select> styled like Input and the Radix SelectTrigger (same
 * height, border, surface, chevron and focus ring). Use it where a plain
 * form control is needed: GET filter forms in server components, or long
 * option lists. Long option text truncates instead of being clipped.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative min-w-0">
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full min-w-0 appearance-none truncate rounded-md border border-input bg-card py-1 pl-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50"
      />
    </div>
  ),
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
