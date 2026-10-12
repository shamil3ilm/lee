'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createInviteAction,
  revokeInviteAction,
  setMemberStatusAction,
  type InviteActionResult,
} from '@/app/(authed)/settings/invites/actions'

function report(r: InviteActionResult): boolean {
  if ('error' in r) {
    toast.error(r.error)
    return false
  }
  toast.success(r.message)
  return true
}

/** Owner: invite an email. */
export function InviteForm({ disabled }: { disabled: boolean }) {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          if (report(await createInviteAction({ email, note }))) {
            setEmail('')
            setNote('')
          }
        })
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-note">Note (only you see it)</Label>
        <Input id="invite-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" disabled={disabled || pending}>
        {pending ? 'Inviting…' : 'Invite'}
      </Button>
    </form>
  )
}

/** Owner: revoke one invite. */
export function RevokeInviteButton({ inviteId, accepted }: { inviteId: string; accepted: boolean }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const ok = !accepted || window.confirm('Revoking an accepted invite also suspends that account. Continue?')
        if (ok) start(async () => void report(await revokeInviteAction(inviteId)))
      }}
    >
      Revoke
    </Button>
  )
}

/** Owner: suspend / reactivate a member account. */
export function MemberStatusButton({ userId, status }: { userId: string; status: string }) {
  const [pending, start] = useTransition()
  const next = status === 'active' ? 'suspended' : 'active'
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => void report(await setMemberStatusAction(userId, next)))}>
      {next === 'suspended' ? 'Suspend' : 'Reactivate'}
    </Button>
  )
}
