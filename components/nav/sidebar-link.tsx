'use client'
import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav-config'

interface SidebarLinkProps {
  item: NavItem
  active: boolean
  badge?: number
  /** Desktop rail currently engaged → wrap in a tooltip. */
  rail: boolean
  onNavigate?: () => void
}

// Hidden when the desktop shell is in rail mode. The mobile Sheet renders in
// a portal outside the shell, so these variants never apply there.
const RAIL_HIDDEN = 'group-data-[sidebar=rail]/shell:hidden'

export function SidebarLink({ item, active, badge, rail, onNavigate }: SidebarLinkProps) {
  const { href, label, icon: Icon } = item
  const showBadge = typeof badge === 'number' && badge > 0
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? label : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'group-data-[sidebar=rail]/shell:justify-center group-data-[sidebar=rail]/shell:px-0',
        active
          ? 'bg-accent font-semibold text-accent-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn('flex-1 truncate', RAIL_HIDDEN)}>{label}</span>
      {showBadge ? (
        <>
          <span
            className={cn(
              'ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums',
              RAIL_HIDDEN,
            )}
            aria-label={`${badge} pending`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
          <span
            aria-hidden
            className="absolute right-2 top-1 hidden size-1.5 rounded-full bg-primary group-data-[sidebar=rail]/shell:block"
          />
        </>
      ) : null}
    </Link>
  )
  if (!rail) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {showBadge ? ` (${badge})` : ''}
      </TooltipContent>
    </Tooltip>
  )
}
