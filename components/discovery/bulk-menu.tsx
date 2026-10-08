'use client'
import { ChevronDown, ListX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BulkMenuProps {
  disabled: boolean
  /** Actionable rows on this page. */
  pageCount: number
  filteredView: boolean
  olderThanDays: number
  onDismissPage: () => void
  onDismissAllFiltered: () => void
  onDismissOlder: () => void
}

/**
 * Page-wide dismiss actions, folded into one menu on the pager row (the
 * selection bar appears only once a row is ticked).
 */
export function BulkMenu({
  disabled,
  pageCount,
  filteredView,
  olderThanDays,
  onDismissPage,
  onDismissAllFiltered,
  onDismissOlder,
}: BulkMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8" disabled={disabled} data-testid="bulk-menu">
          <ListX className="size-4" aria-hidden="true" />
          Bulk dismiss
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {pageCount > 0 ? <DropdownMenuItem onSelect={onDismissPage}>Dismiss all on this page</DropdownMenuItem> : null}
        {filteredView ? (
          <DropdownMenuItem onSelect={onDismissAllFiltered}>Dismiss all filtered</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onDismissOlder}>Dismiss older than {olderThanDays}d</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
