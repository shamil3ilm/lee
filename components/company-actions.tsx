'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EyeOff, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteCompany, removeFromWatchlist } from '@/app/(authed)/companies/[id]/actions'

interface CompanyActionsProps {
  companyId: string
  companyName: string
  onEdit: () => void
}

export function CompanyActions({ companyId, companyName, onEdit }: CompanyActionsProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const handleRemove = (): void => {
    startTransition(async () => {
      const result = await removeFromWatchlist(companyId)
      if ('success' in result) {
        toast.success('Removed from watchlist')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDelete = (): void => {
    startTransition(async () => {
      // deleteCompany redirects on success, so a returned result is always an error.
      const result = await deleteCompany(companyId)
      if (result && 'error' in result) toast.error(result.error)
    })
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onClick={handleRemove} disabled={pending}>
              <EyeOff className="size-4" />
              Remove from watchlist
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setConfirmOpen(true)}
              className="text-destructive focus:text-destructive"
              disabled={pending}
            >
              <Trash2 className="size-4" />
              Delete company
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {companyName}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the company. Linked applications, jobs, and contacts
              may be updated (contacts are unlinked; jobs stay for applications you already
              have). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false)
                handleDelete()
              }}
              disabled={pending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
