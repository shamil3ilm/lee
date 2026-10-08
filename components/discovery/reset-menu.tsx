'use client'
import { useState } from 'react'
import { MoreHorizontal, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ResetDiscoveriesDialog, type ResetSource } from './reset-dialog'

/** Discovery's overflow menu (header): "Reset discoveries…". */
export function DiscoveryOverflowMenu({ sources }: { sources: readonly ResetSource[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More Discovery actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <RotateCcw className="size-4" />
            Reset discoveries…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetDiscoveriesDialog open={open} onOpenChange={setOpen} sources={sources} />
    </>
  )
}

/** Settings › Storage: the same dialog behind a plain button. */
export function ResetDiscoveriesButton({ sources }: { sources: readonly ResetSource[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="size-4" />
        Reset discoveries…
      </Button>
      <ResetDiscoveriesDialog open={open} onOpenChange={setOpen} sources={sources} />
    </>
  )
}
