'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ListChecks, MoreHorizontal, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AiModePromptSet } from '@/lib/discovery/ai-mode/load'
import { AiModeDialog } from './ai-mode-dialog'
import { ResetDiscoveriesDialog, type ResetSource } from './reset-dialog'

interface DiscoveryMenuProps {
  sources: readonly ResetSource[]
  promptSet: AiModePromptSet
  /** Today's open shortlist picks; null hides the link (no shortlist yet). */
  shortlistCount: number | null
}

/**
 * Discovery's "⋯" menu: the secondary header actions (today's shortlist,
 * Google AI Mode prompts, reset) folded away so the first card sits high on
 * the page. "Add from text or link" stays a visible button next to it.
 */
export function DiscoveryMenu({ sources, promptSet, shortlistCount }: DiscoveryMenuProps) {
  const [aiOpen, setAiOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="size-9 p-0" aria-label="More Discovery actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {shortlistCount !== null ? (
            <DropdownMenuItem asChild>
              <Link href="/shortlist" data-testid="shortlist-banner">
                <ListChecks className="size-4" />
                Today’s top picks
                <span className="ml-auto tabular-nums text-muted-foreground">{shortlistCount}</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setAiOpen(true)} data-testid="ai-mode-trigger">
            <Sparkles className="size-4" />
            Search with Google AI Mode…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setResetOpen(true)}>
            <RotateCcw className="size-4" />
            Reset discoveries…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AiModeDialog promptSet={promptSet} open={aiOpen} onOpenChange={setAiOpen} />
      <ResetDiscoveriesDialog open={resetOpen} onOpenChange={setResetOpen} sources={sources} />
    </>
  )
}
