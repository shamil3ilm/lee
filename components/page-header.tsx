import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Keep a short action row (one or two icon-sized buttons) on the title row at every width. */
  inlineActions?: boolean
  className?: string
}

/**
 * Page title block: h1, one-line description, actions.
 *
 * Actions sit on the title row only from `lg` up. Below that (phones, and
 * tablets where the sidebar leaves ~460px) they drop under the description,
 * so the title and subtitle never get squeezed or clipped by a button row.
 * Filters and secondary controls belong in a `Toolbar` under the header,
 * not in `actions`.
 */
export function PageHeader({ title, description, actions, inlineActions = false, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex gap-4 lg:items-start lg:justify-between lg:gap-6',
        inlineActions ? 'flex-row items-start justify-between' : 'flex-col lg:flex-row',
        className,
      )}
    >
      <div className="min-w-0 lg:flex-1">
        <h1 className="text-balance break-words text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-prose text-pretty text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className={cn('flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end', inlineActions && 'shrink-0 justify-end')}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}

interface ToolbarProps {
  children: React.ReactNode
  className?: string
  /** Accessible name when the toolbar groups filters (e.g. "Filter todos"). */
  label?: string
}

/**
 * A row of filters or view controls under a PageHeader. Wraps on narrow
 * screens with a consistent gap; items keep their natural height (use
 * `size="sm"` buttons so chips and selects line up).
 */
export function Toolbar({ children, className, label }: ToolbarProps) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {children}
    </div>
  )
}
