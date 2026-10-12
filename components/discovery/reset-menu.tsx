'use client'
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResetDiscoveriesDialog, type ResetSource } from './reset-dialog'

// Discovery's header opens the same dialog from its "⋯" menu (discovery-menu.tsx).

/** Settings › Storage: the reset dialog behind a plain button. */
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
