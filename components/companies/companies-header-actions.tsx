'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { findCompaniesNow } from '@/app/(authed)/discoveries/company-actions'
import type { CompanyPrompt } from '@/lib/company-discovery/ai-prompts'
import { PasteCompaniesDialog } from './paste-companies-dialog'
import { ResetCompaniesDialog } from './reset-companies-dialog'

/** Companies tab header: "Add companies" and the overflow menu (run the search now, reset companies). */
export function CompaniesHeaderActions({ prompts }: { prompts: readonly CompanyPrompt[] }) {
  const [pending, start] = useTransition()
  const [resetOpen, setResetOpen] = useState(false)
  const runNow = (): void =>
    start(async () => {
      const r = await findCompaniesNow()
      if ('error' in r) toast.error(r.error)
      else toast.success(r.message ?? 'Queued')
    })
  return (
    <div className="flex items-center gap-1">
      <PasteCompaniesDialog prompts={prompts} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="size-9 p-0" aria-label="More company actions" data-testid="companies-more">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={pending} onSelect={runNow}>
            <Search className="size-4" aria-hidden="true" />
            Run the weekly search now
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setResetOpen(true)} data-testid="reset-companies">
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset companies…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetCompaniesDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  )
}
