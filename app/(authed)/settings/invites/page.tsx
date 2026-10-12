import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import { isOwner } from '@/lib/auth/owner'
import { connectGoogleWorkspaceAction } from '@/lib/google/connect-actions'
import { googleScopesByUser, OWNER_SCOPES } from '@/lib/google/scopes'
import { inviteeSeatsUsed, listInvites } from '@/lib/tenancy/invites'
import { listMembers } from '@/lib/tenancy/admin-queries'
import { BETA_INVITEE_CAP } from '@/lib/tenancy/limits'
import { formatDateTime } from '@/lib/ui/date'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteForm, MemberStatusButton, RevokeInviteButton } from '@/components/settings/invites-panel'

export const dynamic = 'force-dynamic'

/**
 * Owner only: invite-only beta admin (spec §2.4). Invites, accounts
 * (metadata only, never their data) and the owner's Gmail connection.
 * Anyone else gets a 404.
 */
export default async function InvitesPage() {
  const userId = await requireUserId()
  if (!(await isOwner(userId))) notFound()
  const now = new Date()
  const [invites, members, used, scopes] = await Promise.all([
    listInvites(now),
    listMembers(),
    inviteeSeatsUsed(undefined, now),
    googleScopesByUser([userId]),
  ])
  const mine = scopes.get(userId)
  // The owner's Gmail + Calendar grant survives the narrower sign-in scopes
  // (include_granted_scopes; the stored scope never shrinks on sign-in), so
  // the prompt shows only when a scope is really missing.
  const missing = OWNER_SCOPES.filter((sc) => !mine?.has(sc))
  const gmailConnected = missing.length === 0
  const full = used >= BETA_INVITEE_CAP

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Invites"
        description={`lee is invite-only. Invited people sign in with Google (no Gmail access) and bring their own AI keys. ${used} of ${BETA_INVITEE_CAP} seats used.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            The invite is the email itself: there is no link to share. It is valid for 30 days; they sign in at /signin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm disabled={full} />
          {full ? <p className="mt-2 text-sm text-muted-foreground">The beta is full. Revoke an invite to free a seat.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            <ul className="divide-y" data-testid="invite-list">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.expired ? 'expired' : i.status} · invited {formatDateTime(i.createdAt, 'date-year')}
                      {i.note ? ` · ${i.note}` : ''}
                    </p>
                  </div>
                  {i.status !== 'revoked' && !i.expired ? <RevokeInviteButton inviteId={i.id} accepted={i.status === 'accepted'} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>Account metadata only. You never see another person&apos;s jobs, documents, keys or logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" data-testid="member-list">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.id === userId ? 'owner' : m.status} · joined {formatDateTime(m.createdAt, 'date-year')}
                    {m.lastSeenAt ? ` · last seen ${formatDateTime(m.lastSeenAt, 'date-year')}` : ''}
                  </p>
                </div>
                {m.id === userId ? null : <MemberStatusButton userId={m.id} status={m.status} />}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="owner-google-grant">
        <CardHeader>
          <CardTitle>Your Gmail &amp; Calendar</CardTitle>
          <CardDescription>
            Sign-in asks everyone for basic scopes only. Gmail sync, job-alert emails, the emailed digest and Calendar are yours
            alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gmailConnected ? (
            <p className="text-sm" data-testid="google-grant-ok">
              Connected: Gmail and Calendar keep working. Nothing to do.
            </p>
          ) : (
            <div role="alert" className="space-y-3 rounded-md border border-border bg-muted p-3 text-sm" data-testid="google-grant-missing">
              <p>
                {mine ? 'Gmail or Calendar access is missing from your Google grant' : 'No Google account is linked'}, so Gmail
                sync, job-alert emails, the digest email and Calendar are paused.
              </p>
              <form action={connectGoogleWorkspaceAction}>
                <Button type="submit">Reconnect Gmail &amp; Calendar</Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
