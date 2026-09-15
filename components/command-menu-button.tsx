'use client'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'

/**
 * Stub command palette trigger — signals the keyboard-first design intent.
 * Wiring an actual palette is a future change; the visible chip + ⌘K hint
 * is the shipping increment here.
 */
export function CommandMenuButton() {
  const notify = React.useCallback(() => {
    toast('Command menu coming soon', { description: 'Keyboard search is on the roadmap.' })
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        notify()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notify])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={notify}
      className="hidden h-8 gap-2 text-xs text-muted-foreground sm:inline-flex"
      aria-label="Open command menu"
    >
      <Search className="size-3.5" />
      <span>Search</span>
      <kbd className="pointer-events-none ml-1 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  )
}
