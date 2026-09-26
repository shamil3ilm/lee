'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Link2, Loader2, Unlink } from 'lucide-react'
import { linkContactAction, unlinkContactAction } from '@/app/(authed)/contacts/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CONTACT_LINK_ROLES,
  CONTACT_LINK_ROLE_LABELS,
  isContactLinkRole,
  type ContactLinkRole,
} from '@/lib/contacts/roles'

export interface LinkedContact {
  id: string
  name: string
  email: string | null
  /** The link role (recruiter, referrer, …), not the contact's job title. */
  role: string
}

interface ApplicationContactsCardProps {
  applicationId: string
  linked: LinkedContact[]
  options: Array<{ id: string; name: string }>
}

function roleLabel(role: string): string {
  return isContactLinkRole(role) ? CONTACT_LINK_ROLE_LABELS[role] : role
}

/** "Points of contact" on the application page: list, link and unlink. */
export function ApplicationContactsCard({ applicationId, linked, options }: ApplicationContactsCardProps) {
  const [open, setOpen] = useState(false)
  const [contactId, setContactId] = useState('')
  const [role, setRole] = useState<ContactLinkRole>('recruiter')
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const handleLink = (): void => {
    if (!contactId) {
      toast.error('Pick a contact first.')
      return
    }
    startTransition(async () => {
      const result = await linkContactAction(applicationId, contactId, role)
      if ('success' in result) {
        toast.success('Contact linked')
        setOpen(false)
        setContactId('')
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnlink = (c: LinkedContact): void => {
    const key = `${c.id}-${c.role}`
    setBusyKey(key)
    startTransition(async () => {
      const result = await unlinkContactAction(applicationId, c.id, c.role)
      if ('success' in result) toast.success(`${c.name} unlinked`)
      else toast.error(result.error)
      setBusyKey(null)
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Points of contact</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Link2 className="size-3.5" />
          Link contact
        </Button>
      </CardHeader>
      <CardContent>
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">None linked yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {linked.map((c) => {
              const key = `${c.id}-${c.role}`
              return (
                <li key={key} className="flex items-start gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {roleLabel(c.role)}
                      {c.email ? (
                        <>
                          {' · '}
                          <a className="hover:underline" href={`mailto:${c.email}`}>
                            {c.email}
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label={`Unlink ${c.name}`}
                    disabled={pending}
                    onClick={() => handleUnlink(c)}
                  >
                    {busyKey === key ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Unlink className="size-3.5" />
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a contact</DialogTitle>
            <DialogDescription>
              Attach someone from your contacts to this application.{' '}
              <Link href="/contacts" className="underline underline-offset-2">
                Add a new contact
              </Link>{' '}
              first if they are not listed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="link-contact">Contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger id="link-contact">
                  <SelectValue placeholder={options.length ? 'Choose…' : 'No contacts yet'} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-role">Role</Label>
              <Select value={role} onValueChange={(v) => isContactLinkRole(v) && setRole(v)}>
                <SelectTrigger id="link-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_LINK_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {CONTACT_LINK_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleLink} disabled={pending || !contactId}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
