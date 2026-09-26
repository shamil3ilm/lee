'use client'
import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { deleteContact } from '@/app/(authed)/contacts/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { CompanyOption, ContactFormValues } from '@/components/contact-form-fields'

// The edit form only loads when the user opens it.
const ContactEditDialog = dynamic(
  () => import('@/components/contact-edit-dialog').then((m) => m.ContactEditDialog),
  { ssr: false },
)

interface ContactActionsProps {
  contact: ContactFormValues & { id: string }
  companies: CompanyOption[]
}

export function ContactActions({ contact, companies }: ContactActionsProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleDelete = (): void => {
    startTransition(async () => {
      const result = await deleteContact(contact.id)
      if ('success' in result) {
        toast.success('Contact deleted')
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
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Actions for ${contact.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen ? (
        <ContactEditDialog
          contactId={contact.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={contact}
          companies={companies}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${contact.name}?`}
        description={
          <>
            <p>This permanently deletes the contact.</p>
            <p>
              Applications and todos that mention them are kept: the contact is simply unlinked
              from them. This cannot be undone.
            </p>
          </>
        }
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  )
}
