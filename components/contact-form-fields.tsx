'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface CompanyOption {
  id: string
  name: string
}

export interface ContactFormValues {
  name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  companyId: string | null
  notes: string | null
}

/** Sentinel for "no company" — Radix Select cannot hold an empty value. */
export const NO_COMPANY = '__none__'

/** Convert the Select sentinel back to an empty string for the server. */
export function normalizeContactForm(fd: FormData): FormData {
  if (fd.get('companyId') === NO_COMPANY) fd.set('companyId', '')
  return fd
}

interface ContactFormFieldsProps {
  companies: CompanyOption[]
  initial?: ContactFormValues
  /** Prefix for input ids so two dialogs on one page never collide. */
  idPrefix?: string
}

/** Shared fields for the add and edit contact dialogs. */
export function ContactFormFields({ companies, initial, idPrefix = 'contact' }: ContactFormFieldsProps) {
  const id = (name: string) => `${idPrefix}-${name}`
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={id('name')}>Name *</Label>
        <Input id={id('name')} name="name" required autoFocus defaultValue={initial?.name ?? ''} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id('role')}>Role</Label>
        <Input
          id={id('role')}
          name="role"
          placeholder="Recruiter, Hiring Manager…"
          defaultValue={initial?.role ?? ''}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id('email')}>Email</Label>
        <Input id={id('email')} name="email" type="email" defaultValue={initial?.email ?? ''} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id('phone')}>Phone</Label>
        <Input id={id('phone')} name="phone" defaultValue={initial?.phone ?? ''} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id('linkedinUrl')}>LinkedIn URL</Label>
        <Input
          id={id('linkedinUrl')}
          name="linkedinUrl"
          type="url"
          defaultValue={initial?.linkedinUrl ?? ''}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id('companyId')}>Company</Label>
        <Select name="companyId" defaultValue={initial?.companyId ?? NO_COMPANY}>
          <SelectTrigger id={id('companyId')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPANY}>(no company)</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id('notes')}>Notes</Label>
        <Textarea id={id('notes')} name="notes" rows={3} defaultValue={initial?.notes ?? ''} />
      </div>
    </div>
  )
}
