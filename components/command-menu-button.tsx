'use client'
import { Search } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { CommandMenuDialog } from '@/components/command-menu-dialog'

/**
 * Toolbar chip + ⌘K / Ctrl+K global hotkey that opens the command palette
 * (see command-menu-dialog.tsx). The dialog owns all search + navigation
 * state; this component is just the launcher.
 */
export function CommandMenuButton() {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
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
        className="hidden h-8 gap-2 text-xs text-muted-foreground sm:inline-flex"
        aria-label="Open command menu"
      >
        <Search className="size-3.5" />
        <span>Search</span>
        <kbd className="pointer-events-none ml-1 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandMenuDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
