'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { findCompaniesNow } from '@/app/(authed)/discoveries/company-actions'
import type { CompanyPrompt } from '@/lib/company-discovery/ai-prompts'
import { PasteCompaniesDialog } from './paste-companies-dialog'

/** Companies tab header: "Add companies" and the overflow menu (run the search now). */
export function CompaniesHeaderActions({ prompts, children }: { prompts: readonly CompanyPrompt[]; children?: React.ReactNode }) {
  const [pending, start] = useTransition()
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
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
