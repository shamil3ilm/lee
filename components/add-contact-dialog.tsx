'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { addContact } from '@/app/(authed)/contacts/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  ContactFormFields,
  normalizeContactForm,
  type CompanyOption,
} from '@/components/contact-form-fields'

interface AddContactDialogProps {
  companies: CompanyOption[]
}

export function AddContactDialog({ companies }: AddContactDialogProps) {
  const [open, setOpen] = useState(false)

  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await addContact(normalizeContactForm(fd))
    if ('success' in result) {
      toast.success('Contact added')
      setOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Add contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <ContactFormFields companies={companies} idPrefix="add-contact" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding…">Add contact</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
