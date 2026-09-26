'use client'
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Kanban, List } from 'lucide-react'
import { createLocalFlag, type LocalFlag } from '@/lib/ui/local-flag'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

import type { BoardView } from '@/lib/board/view'

export type { BoardView } from '@/lib/board/view'

const flags = new Map<string, LocalFlag>()
function preferenceFlag(page: string, defaultView: BoardView): LocalFlag {
  // The flag records "prefers the non-default view", so an unset key means
  // the page default.
  const key = `lee.view.${page}.${defaultView === 'list' ? 'board' : 'list'}`
  let flag = flags.get(key)
  if (!flag) {
    flag = createLocalFlag(key)
    flags.set(key, flag)
  }
  return flag
}

interface BoardViewToggleProps {
  /** Page key for the remembered preference, e.g. "todos". */
  page: string
  /** View the server rendered. */
  current: BoardView
  defaultView: BoardView
  /** True when the URL carried an explicit `view=` (it wins over the memory). */
  explicit: boolean
  boardHref: string
  listHref: string
}

/**
 * Board / List switch. The view lives in the URL (`?view=board`) so the
 * server fetches only what that view shows; the viewer's last choice is
 * remembered per page with the local-flag helper and restored on the next
 * visit that doesn't name a view.
 */
export function BoardViewToggle({
  page,
  current,
  defaultView,
  explicit,
  boardHref,
  listHref,
}: BoardViewToggleProps) {
  const router = useRouter()
  const flag = preferenceFlag(page, defaultView)
  const prefersOther = React.useSyncExternalStore(flag.subscribe, flag.get, flag.getServer)
  const remembered: BoardView = prefersOther ? (defaultView === 'list' ? 'board' : 'list') : defaultView

  React.useEffect(() => {
    if (!explicit && remembered !== current) {
      router.replace(remembered === 'board' ? boardHref : listHref, { scroll: false })
    }
  }, [explicit, remembered, current, router, boardHref, listHref])

  const choose = (view: BoardView): void => {
    flag.set(view !== defaultView)
  }

  const item = (view: BoardView, href: string, Icon: typeof List, label: string) => (
    <Link
      href={href}
      scroll={false}
      aria-pressed={current === view}
      onClick={() => choose(view)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
        focusRing,
        current === view ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )

  return (
    <div role="group" aria-label="View" className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
      {item('board', boardHref, Kanban, 'Board')}
      {item('list', listHref, List, 'List')}
    </div>
  )
}
