'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, ExternalLink, GitBranch, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  connectGitHubAction,
  disconnectGitHubAction,
  setFollowStarredAction,
  testGitHubAction,
} from '@/app/(authed)/settings/integrations/connect-actions'
import type { GitHubStatus } from '@/lib/integrations/github/service'
import { ConnectionIdentity } from './connection-identity'
import { NotConfigured } from './not-configured'

const SETUP = [
  'Create a GitHub App (GitHub › Settings › Developer settings › GitHub Apps) with the callback URL <your site>/api/integrations/github/callback, "Expire user authorization tokens" on, webhooks off.',
  'Repository permissions: Metadata read-only and Contents read and write. Optional account permission: Starring read-only.',
  'Generate a client secret and a private key; set GITHUB_APP_ID, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_PRIVATE_KEY and GITHUB_APP_SLUG in Vercel.',
]

const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  'metadata:read': 'Metadata (read)',
  'contents:read': 'Contents (read)',
  'contents:write': 'Contents (read & write)',
  'starring:read': 'Starring (read)',
}

const CALLBACK_MESSAGES: Readonly<Record<string, string>> = {
  connected: 'GitHub connected.',
  state: 'That sign-in link expired or did not start here. Please try Connect again.',
  denied: 'GitHub access was not granted.',
  exchange: 'GitHub did not accept the authorization. Please try again.',
  profile: 'Connected, but GitHub could not be read. Please try again.',
  not_configured: 'GitHub is not configured on this deployment yet.',
}

interface GitHubCardProps {
  status: GitHubStatus
  /** `?github=` from the callback redirect. */
  callback: string | null
}

export function GitHubCard({ status, callback }: GitHubCardProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const [followStarred, setFollowStarred] = useState(status.followStarred)
  const callbackMessage = callback ? CALLBACK_MESSAGES[callback] : null

  const connect = (): void => {
    start(async () => {
      const r = await connectGitHubAction()
      if (!r.ok) toast.error(r.error)
      else window.location.assign(r.url)
    })
  }
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>): void => {
    start(async () => {
      const r = await fn()
      if (r.ok) toast.success(r.message)
      else toast.error(r.error)
      router.refresh()
    })
  }

  return (
    <Card id="github" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>GitHub</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {callbackMessage ? (
          <p role="status" className={callback === 'connected' ? 'text-success' : 'text-warning'} data-testid="github-callback-status">
            {callbackMessage}
          </p>
        ) : null}
        {!status.configured ? (
          <NotConfigured provider="GitHub" missing={status.missingEnv} steps={SETUP} />
        ) : !status.connected ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              Connect the lee GitHub App to publish your portfolio without a personal token, show repo evidence on your Résumé and suggest
              Radar releases. lee asks for the minimum: Metadata read, and Contents read &amp; write only on repositories where you install
              the app (install it on your portfolio repo). Private repos are only visible if you choose them at install time.
            </p>
            <Button type="button" size="sm" onClick={connect} disabled={pending} data-testid="github-connect">
              <GitBranch className="size-3.5" aria-hidden="true" />
              Connect GitHub
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ConnectionIdentity
              name={status.login ?? 'GitHub user'}
              detail={status.name ?? undefined}
              avatarUrl={status.avatarUrl}
              badge={
                status.needsReconnect ? (
                  <Badge variant="warning" className="text-[10px]">Reconnect needed</Badge>
                ) : (
                  <Badge variant="success" className="text-[10px]">
                    <CheckCircle2 className="mr-1 size-3" aria-hidden="true" /> Connected
                  </Badge>
                )
              }
            />
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permissions granted</div>
              {status.permissions.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {status.permissions.map((p) => (
                    <li key={p}>
                      <Badge variant="outline" className="text-[11px]">{PERMISSION_LABELS[p] ?? p}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">The app is not installed yet: install it on your portfolio repository.</p>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Installed repositories{status.repositorySelection === 'all' ? ' (all)' : ''}
              </div>
              {status.reposUnavailable ? (
                <p className="text-xs text-muted-foreground">Could not list them right now.</p>
              ) : status.repos.length > 0 ? (
                <ul className="space-y-1" data-testid="github-installed-repos">
                  {status.repos.map((r) => (
                    <li key={r.fullName} className="flex items-center gap-1.5 text-xs">
                      {r.isPrivate ? <Lock className="size-3 text-muted-foreground" aria-label="Private" /> : null}
                      <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {r.fullName}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None yet.</p>
              )}
            </div>
            <Checkbox
              checked={followStarred}
              disabled={pending}
              onChange={(e) => {
                const on = e.currentTarget.checked
                setFollowStarred(on)
                run(() => setFollowStarredAction(on))
              }}
              label="Suggest my starred repos for Radar releases"
              description="Needs the optional Starring (read) permission. You still confirm each one in Radar › Sources."
            />
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button asChild variant="outline" size="sm">
                <a href={status.manageUrl ?? status.installUrl ?? '#'} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  {status.installed ? 'Manage repositories' : 'Install on a repository'}
                </a>
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(testGitHubAction)}>
                Test
              </Button>
              {status.needsReconnect ? (
                <Button type="button" size="sm" disabled={pending} onClick={connect}>
                  Reconnect
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect GitHub?"
        description="lee revokes its authorization at GitHub and deletes the tokens and the cached repo stats. Publish falls back to your fine-grained token, if you saved one. The app stays installed until you uninstall it on GitHub."
        confirmLabel="Disconnect"
        pending={pending}
        onConfirm={() => {
          setConfirm(false)
          run(disconnectGitHubAction)
        }}
      />
    </Card>
  )
}
