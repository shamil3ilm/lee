'use client'
import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav-config'
import { NavBadge, NavBadgeSuffix } from './nav-badges'

interface SidebarLinkProps {
  item: NavItem
  active: boolean
  /** Desktop rail currently engaged → wrap in a tooltip. */
  rail: boolean
  onNavigate?: () => void
}

// Hidden when the desktop shell is in rail mode (see nav-badges.tsx too).
const RAIL_HIDDEN = 'group-data-[sidebar=rail]/shell:hidden'

export function SidebarLink({ item, active, rail, onNavigate }: SidebarLinkProps) {
  const { href, label, icon: Icon, badge: badgeKey } = item
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
      {badgeKey ? <NavBadge badgeKey={badgeKey} /> : null}
    </Link>
  )
  if (!rail) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {badgeKey ? <NavBadgeSuffix badgeKey={badgeKey} /> : null}
      </TooltipContent>
    </Tooltip>
  )
}
