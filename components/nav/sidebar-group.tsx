'use client'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavBadges, NavGroup } from './nav-config'
import { SidebarLink } from './sidebar-link'

interface SidebarGroupProps {
  group: NavGroup
  open: boolean
  activeHref: string | null
  badges: NavBadges
  rail: boolean
  onToggle: (key: string) => void
  onNavigate?: () => void
}

export function SidebarGroup({
  group,
  open,
  activeHref,
  badges,
  rail,
  onToggle,
  onNavigate,
}: SidebarGroupProps) {
  const listId = `nav-group-${group.key}`
  return (
    <div className="group-data-[sidebar=rail]/shell:border-t group-data-[sidebar=rail]/shell:pt-2 group-data-[sidebar=rail]/shell:first:border-t-0">
      <button
        type="button"
        onClick={() => onToggle(group.key)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[sidebar=rail]/shell:hidden"
      >
        <ChevronRight
          className={cn('size-3 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        {group.label}
      </button>
      {/* Rail mode always shows every icon regardless of collapse state. */}
      <div
        id={listId}
        className={cn(
          'mt-0.5 space-y-0.5',
          !open && 'hidden',
          'group-data-[sidebar=rail]/shell:block',
        )}
      >
        {group.items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={activeHref === item.href}
            badge={item.badge ? badges[item.badge] : undefined}
            rail={rail}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}
