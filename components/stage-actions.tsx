'use client'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { deleteStageAction } from '@/app/(authed)/applications/[id]/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { StageEditFields } from '@/components/stage-edit-dialog'

const StageEditDialog = dynamic(
  () => import('@/components/stage-edit-dialog').then((m) => m.StageEditDialog),
  { ssr: false },
)

interface StageActionsProps {
  stageId: string
  label: string
  inCalendar: boolean
  initial: StageEditFields
}

/** Edit / delete menu for one interview stage on the timeline. */
export function StageActions({ stageId, label, inCalendar, initial }: StageActionsProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleDelete = (): void => {
    startTransition(async () => {
      const result = await deleteStageAction(stageId)
      if ('success' in result) {
        toast.success('Stage deleted')
        setConfirmOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6" aria-label={`Actions for ${label}`}>
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit stage
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete stage
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen ? (
        <StageEditDialog
          stageId={stageId}
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={initial}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${label}"?`}
        description={
          <>
            <p>This removes the stage and its prep and debrief notes from the timeline.</p>
            {inCalendar ? <p>Its Google Calendar event is removed too.</p> : null}
            <p>Generated debrief documents stay in Documents. This cannot be undone.</p>
          </>
        }
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  )
}
