'use client'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { deleteApplication } from '@/app/(authed)/applications/[id]/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { JobEditFields } from '@/components/job-edit-dialog'

const JobEditDialog = dynamic(
  () => import('@/components/job-edit-dialog').then((m) => m.JobEditDialog),
  { ssr: false },
)

interface ApplicationActionsProps {
  applicationId: string
  title: string
  initial: JobEditFields
  companies: Array<{ id: string; name: string }>
}

/** Header actions on the application page: edit job details, delete. */
export function ApplicationActions({ applicationId, title, initial, companies }: ApplicationActionsProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleDelete = (): void => {
    startTransition(async () => {
      // Redirects on success, so a returned result is always an error.
      const result = await deleteApplication(applicationId)
      if (result && 'error' in result) toast.error(result.error)
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="size-3.5" />
        Edit details
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More application actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete application
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen ? (
        <JobEditDialog
          applicationId={applicationId}
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={initial}
          companies={companies}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${title}"?`}
        description={
          <>
            <p>
              This permanently deletes the application with its interview stages, timeline and
              contact links (the contacts themselves are kept).
            </p>
            <p>
              Documents, todos and CV scores are kept but no longer linked to it. To keep the
              history instead, set the status to Withdrawn.
            </p>
          </>
        }
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  )
}
