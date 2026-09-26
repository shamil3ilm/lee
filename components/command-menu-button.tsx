'use client'
import { Search } from 'lucide-react'
import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'

// The palette (search, quick actions, result rendering) is fetched on first
// open, by click or by the hotkey, instead of shipping in every authed page's
// first-load bundle. Hover/focus on the chip warms the chunk.
const CommandMenuDialog = dynamic(
  () => import('@/components/command-menu-dialog').then((m) => m.CommandMenuDialog),
  { ssr: false },
)

function preloadDialog(): void {
  void import('@/components/command-menu-dialog')
}

/**
 * Toolbar chip + ⌘K / Ctrl+K global hotkey that opens the command palette
 * (see command-menu-dialog.tsx). The dialog owns all search + navigation
 * state; this component is just the launcher.
 */
export function CommandMenuButton() {
  const [open, setOpenState] = React.useState(false)
  // Becomes true on first open and stays true, so the dialog mounts (and
  // its chunk loads) only once it is actually wanted.
  const [requested, setRequested] = React.useState(false)
  const setOpen = React.useCallback((next: boolean) => {
    if (next) setRequested(true)
    setOpenState(next)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setRequested(true)
        setOpenState((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {/* Mobile: icon-only chip so the header row never overflows on 390px viewports. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        onPointerEnter={preloadDialog}
        onFocus={preloadDialog}
        className="sm:hidden"
        aria-label="Open command menu"
      >
        <Search className="size-4" />
      </Button>
      {/* Desktop/tablet: full "Search" chip with ⌘K hint. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        onPointerEnter={preloadDialog}
        onFocus={preloadDialog}
        className="hidden h-8 gap-2 text-xs text-muted-foreground sm:inline-flex"
        aria-label="Open command menu"
      >
        <Search className="size-3.5" />
        <span>Search</span>
        <kbd className="pointer-events-none ml-1 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      {requested ? <CommandMenuDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  )
}
