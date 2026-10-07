'use client'
import { useLayoutEffect, useState, type RefObject } from 'react'
import { workspaceSize, type WorkspaceSize } from '@/lib/latex/editor-prefs'

/**
 * The workspace's width class from its own width (it sits beside the app
 * sidebar, so the viewport says little): wide = panel + editor + PDF,
 * medium = rail + editor + PDF, narrow = Editor / PDF tabs.
 */
export function useWorkspaceSize(ref: RefObject<HTMLElement | null>): WorkspaceSize {
  const [size, setSize] = useState<WorkspaceSize>('wide')
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize(workspaceSize(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}
