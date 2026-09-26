'use client'
import { toast } from 'sonner'
import { updateContact } from '@/app/(authed)/contacts/actions'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ContactFormFields,
  normalizeContactForm,
  type CompanyOption,
  type ContactFormValues,
} from '@/components/contact-form-fields'

interface ContactEditDialogProps {
  contactId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ContactFormValues
  companies: CompanyOption[]
}

export function ContactEditDialog({
  contactId,
  open,
  onOpenChange,
  initial,
  companies,
}: ContactEditDialogProps) {
  async function handleSubmit(fd: FormData): Promise<void> {
    const result = await updateContact(contactId, normalizeContactForm(fd))
    if ('success' in result) {
      toast.success('Contact updated')
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <ContactFormFields companies={companies} initial={initial} idPrefix="edit-contact" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
