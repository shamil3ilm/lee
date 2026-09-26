import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Status and label pill. Tone variants (info, success, warning, danger,
 * neutral, and the pipeline stages) come from the brand tokens so a status
 * reads the same colour on every page. The legacy colour names (slate,
 * blue, indigo, violet, emerald, rose) are aliases for the matching tone.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        neutral: 'border-transparent bg-neutral-soft text-neutral',
        info: 'border-transparent bg-info-soft text-info',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
        saved: 'border-transparent bg-stage-saved-soft text-stage-saved',
        applied: 'border-transparent bg-stage-applied-soft text-stage-applied',
        screen: 'border-transparent bg-stage-screen-soft text-stage-screen',
        interview: 'border-transparent bg-stage-interview-soft text-stage-interview',
        offer: 'border-transparent bg-stage-offer-soft text-stage-offer',
        rejected: 'border-transparent bg-stage-rejected-soft text-stage-rejected',
        withdrawn: 'border-transparent bg-stage-withdrawn-soft text-stage-withdrawn',
        // Legacy aliases.
        slate: 'border-transparent bg-stage-saved-soft text-stage-saved',
        blue: 'border-transparent bg-stage-applied-soft text-stage-applied',
        indigo: 'border-transparent bg-stage-screen-soft text-stage-screen',
        violet: 'border-transparent bg-stage-interview-soft text-stage-interview',
        emerald: 'border-transparent bg-success-soft text-success',
        rose: 'border-transparent bg-danger-soft text-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
