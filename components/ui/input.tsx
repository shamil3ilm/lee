import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          // File pickers: a small secondary button inside the field instead of
          // the browser's bare "Choose File" text.
          type === 'file' &&
            'cursor-pointer items-center py-0 pl-1 text-muted-foreground file:mr-3 file:h-7 file:cursor-pointer file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:text-xs file:font-medium file:text-secondary-foreground hover:file:bg-accent',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
