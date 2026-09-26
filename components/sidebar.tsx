'use client'
import Link from 'next/link'
import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ALL_NAV_HREFS,
  HOME_ITEM,
  NAV_GROUPS,
  SETTINGS_ITEM,
} from '@/components/nav/nav-config'
import { SidebarGroup } from '@/components/nav/sidebar-group'
import { SidebarLink } from '@/components/nav/sidebar-link'
import { RailToggle } from '@/components/nav/rail-toggle'
import { SidebarUser } from '@/components/nav/sidebar-user'
import { isGroupOpen, parseGroupState, pickActiveHref } from '@/lib/ui/nav-active'
import {
  applyRailAttribute,
  getGroupsServerSnapshot,
  getGroupsSnapshot,
  getRailServerSnapshot,
  getRailSnapshot,
  setGroupsRaw,
  setRail,
  subscribeSidebar,
} from '@/lib/ui/sidebar-store'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'
import { APP_NAME } from '@/lib/brand'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  email?: string | null
  name?: string | null
  image?: string | null
  /** Desktop only: allow collapsing to an icon rail. Off inside the mobile drawer. */
  railEnabled?: boolean
}

export function Sidebar({
  className,
  onNavigate,
  email,
  name,
  image,
  railEnabled = false,
}: SidebarProps) {
  const pathname = usePathname()
  const activeHref = pickActiveHref(pathname, ALL_NAV_HREFS)

  const railStored = useSyncExternalStore(subscribeSidebar, getRailSnapshot, getRailServerSnapshot)
  const rail = railEnabled && railStored

  const groupsRaw = useSyncExternalStore(
    subscribeSidebar,
    getGroupsSnapshot,
    getGroupsServerSnapshot,
  )
  const groupState = useMemo(() => parseGroupState(groupsRaw), [groupsRaw])

  // Dev Strict Mode can re-render the shell without the attribute the boot
  // script set; re-apply from storage before paint. Reads storage directly
  // (not the hydration snapshot) so it never undoes the boot script.
  useLayoutEffect(() => {
    if (railEnabled) applyRailAttribute(getRailSnapshot())
  }, [railEnabled])

  const toggleGroup = useCallback(
    (key: string) => {
      const containsActive = NAV_GROUPS.some(
        (g) => g.key === key && g.items.some((i) => i.href === activeHref),
      )
      const current = isGroupOpen(key, groupState, containsActive)
      setGroupsRaw(JSON.stringify({ ...groupState, [key]: !current }))
    },
    [activeHref, groupState],
  )

  return (
    <TooltipProvider delayDuration={200}>
      <aside className={cn('flex h-full flex-col border-r bg-background', className)}>
        <div className="flex h-14 items-center justify-between gap-2 border-b px-5 group-data-[sidebar=rail]/shell:justify-center group-data-[sidebar=rail]/shell:px-2">
          <Link
            href="/"
            onClick={onNavigate}
            aria-label={`${APP_NAME} home`}
            className="text-base group-data-[sidebar=rail]/shell:hidden"
          >
            <Logo size={26} />
          </Link>
          <Link
            href="/"
            onClick={onNavigate}
            aria-label={`${APP_NAME} home`}
            className="hidden group-data-[sidebar=rail]/shell:inline-flex"
          >
            <Logo size={26} markOnly />
          </Link>
          {railEnabled ? <RailToggle rail={rail} onToggle={() => setRail(!rail)} /> : null}
        </div>
        <nav
          aria-label="Main"
          className="flex-1 space-y-3 overflow-y-auto px-3 py-4 group-data-[sidebar=rail]/shell:px-2"
        >
          <SidebarLink
            item={HOME_ITEM}
            active={activeHref === HOME_ITEM.href}
            rail={rail}
            onNavigate={onNavigate}
          />
          {NAV_GROUPS.map((group) => {
            const containsActive = group.items.some((i) => i.href === activeHref)
            return (
              <SidebarGroup
                key={group.key}
                group={group}
                open={isGroupOpen(group.key, groupState, containsActive)}
                activeHref={activeHref}
                rail={rail}
                onToggle={toggleGroup}
                onNavigate={onNavigate}
              />
            )
          })}
        </nav>
        <footer className="mt-auto space-y-1 border-t p-3 group-data-[sidebar=rail]/shell:px-2">
          <SidebarLink
            item={SETTINGS_ITEM}
            active={activeHref === SETTINGS_ITEM.href}
            rail={rail}
            onNavigate={onNavigate}
          />
          {email ? <SidebarUser email={email} name={name} image={image} /> : null}
        </footer>
      </aside>
    </TooltipProvider>
  )
}
