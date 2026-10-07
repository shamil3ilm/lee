'use client'
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface IconButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'aria-label'> {
  /** Accessible name; also the tooltip unless `tip` is given. */
  label: string
  tip?: ReactNode
  pressed?: boolean
  side?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * The workspace's 28 px icon button: an aria-label, a tooltip, the shared
 * focus ring, and an optional pressed state for toggles.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tip, pressed, side = 'bottom', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type={type}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
            pressed && 'bg-primary/10 text-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{tip ?? label}</TooltipContent>
    </Tooltip>
  )
})
