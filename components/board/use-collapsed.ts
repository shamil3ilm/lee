'use client'
import * as React from 'react'
import { createLocalFlag, type LocalFlag } from '@/lib/ui/local-flag'

const flags = new Map<string, LocalFlag>()

function flagFor(key: string): LocalFlag {
  let flag = flags.get(key)
  if (!flag) {
    flag = createLocalFlag(key)
    flags.set(key, flag)
  }
  return flag
}

/**
 * Collapsed state of one board column, remembered in localStorage. Columns
 * that start collapsed store an "expanded" flag instead so the default can
 * change without migrating anyone's storage.
 */
export function useCollapsed(
  boardId: string,
  columnId: string,
  defaultCollapsed = false,
): [boolean, (collapsed: boolean) => void] {
  const key = `lee.board.${boardId}.${columnId}.${defaultCollapsed ? 'expanded' : 'collapsed'}`
  const flag = flagFor(key)
  const stored = React.useSyncExternalStore(flag.subscribe, flag.get, flag.getServer)
  const collapsed = defaultCollapsed ? !stored : stored
  const set = React.useCallback(
    (next: boolean) => flag.set(defaultCollapsed ? !next : next),
    [flag, defaultCollapsed],
  )
  return [collapsed, set]
}
