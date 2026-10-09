'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, ExternalLink, Share2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LocalTime } from '@/components/local-time'
import { connectLinkedInAction, disconnectLinkedInAction } from '@/app/(authed)/settings/integrations/connect-actions'
import type { LinkedInStatus } from '@/lib/integrations/linkedin/service'
import { ConnectionIdentity } from './connection-identity'
import { NotConfigured } from './not-configured'

const SETUP = [
  'Create an app at linkedin.com/developers (it must be associated with a LinkedIn Page you administer; the Page admin verifies it).',
  'Products: add "Sign In with LinkedIn using OpenID Connect" and, for posting, "Share on LinkedIn".',
  'Auth tab: add the redirect URL <your site>/api/integrations/linkedin/callback; set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel.',
]

const CALLBACK_MESSAGES: Readonly<Record<string, string>> = {
  connected: 'LinkedIn connected.',
  state: 'That sign-in link expired or did not start here. Please try Connect again.',
  denied: 'LinkedIn access was not granted.',
  exchange: 'LinkedIn did not accept the authorization. Please try again.',
  id_token: 'LinkedIn’s sign-in answer could not be verified. Please try again.',
  profile: 'Connected, but LinkedIn could not be read. Please try again.',
  not_configured: 'LinkedIn is not configured on this deployment yet.',
}

interface LinkedInCardProps {
  status: LinkedInStatus
  callback: string | null
}

export function LinkedInCard({ status, callback }: LinkedInCardProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [posting, setPosting] = useState(status.canPost)
  const [confirm, setConfirm] = useState(false)
  const callbackMessage = callback ? CALLBACK_MESSAGES[callback] : null

  const connect = (): void => {
    start(async () => {
      const r = await connectLinkedInAction(posting)
      if (!r.ok) toast.error(r.error)
      else window.location.assign(r.url)
    })
  }

  return (
    <Card id="linkedin" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>LinkedIn</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {callbackMessage ? (
          <p role="status" className={callback === 'connected' ? 'text-success' : 'text-warning'} data-testid="linkedin-callback-status">
            {callbackMessage}
          </p>
        ) : null}
        {!status.configured ? (
          <NotConfigured provider="LinkedIn" missing={status.missingEnv} steps={SETUP} />
        ) : (
          <>
            {status.connected ? (
              <ConnectionIdentity
                name={status.name ?? 'LinkedIn member'}
                detail={status.email ?? undefined}
                avatarUrl={status.avatarUrl}
                badge={
                  status.expired ? (
                    <Badge variant="warning" className="text-[10px]">Expired</Badge>
                  ) : (
                    <Badge variant="success" className="text-[10px]">
                      <CheckCircle2 className="mr-1 size-3" aria-hidden="true" /> Connected
                    </Badge>
                  )
                }
              />
            ) : (
              <p className="text-muted-foreground">
                Sign in with LinkedIn to show your name, photo and email here and, if you allow it, to post drafts you approve. LinkedIn has
                no API for editing your profile, connections or messages, so lee never touches them.
              </p>
            )}
            {status.connected ? (
              <p className="text-xs text-muted-foreground" data-testid="linkedin-expiry">
                {status.expiresAt ? (
                  <>
                    Access {status.expired ? 'expired' : 'expires'} <LocalTime date={status.expiresAt} format="date-year" />. LinkedIn tokens
                    do not refresh: reconnect then.
                  </>
                ) : (
                  'LinkedIn did not say when access expires.'
                )}{' '}
                Posting: {status.canPost ? 'allowed (only when you click Post)' : 'off'}.
              </p>
            ) : null}
            <Checkbox
              checked={posting}
              disabled={pending}
              onChange={(e) => setPosting(e.currentTarget.checked)}
              label="Allow posting (Share on LinkedIn)"
              description="Adds the w_member_social permission. lee posts only when you click Post in the composer; it never schedules, likes, comments or sends connection requests."
            />
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button type="button" size="sm" onClick={connect} disabled={pending} data-testid="linkedin-connect">
                {status.connected ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
              </Button>
              {status.connected ? (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/linkedin">LinkedIn tools</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href="https://www.linkedin.com/mypreferences/d/data-sharing-for-permitted-services" target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      Permitted services
                    </a>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
                    Disconnect
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect LinkedIn?"
        description="lee deletes its LinkedIn token. LinkedIn has no API to revoke it, so also remove lee under LinkedIn › Settings › Data privacy › Permitted services. Your imported data and post history stay until you delete them in Settings › LinkedIn."
        confirmLabel="Disconnect"
        pending={pending}
        onConfirm={() => {
          setConfirm(false)
          start(async () => {
            const r = await disconnectLinkedInAction()
            if (r.ok) toast.success(r.message)
            else toast.error(r.error)
            router.refresh()
          })
        }}
      />
    </Card>
  )
}
