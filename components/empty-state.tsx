import type { LucideIcon } from 'lucide-react'
import { EmptyIllustration } from '@/components/brand/empty-illustration'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** Optional context icon, shown as a small chip on the brand illustration. */
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** Compact variant for cards and board columns. */
  size?: 'default' | 'sm'
}

/**
 * Shared empty-state block used across list, table, card and board views:
 * the brand illustration (logo arc + circle), one line of copy, an optional
 * hint and an optional primary action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'default',
}: EmptyStateProps) {
  const compact = size === 'sm'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <div className="relative">
        <EmptyIllustration size={compact ? 52 : 72} />
        {Icon ? (
          <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-lg border bg-card text-muted-foreground shadow-sm">
            <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
