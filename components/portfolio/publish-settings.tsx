'use client'
import { useState, useTransition } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, Loader2, PlugZap, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  removePortfolioTokenAction,
  savePortfolioTokenAction,
  savePublishConfigAction,
  testPortfolioTokenAction,
} from '@/app/(authed)/settings/publish/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormActions, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import type { TokenCheckResult } from '@/lib/portfolio/token-check'

interface PublishSettingsProps {
  config: { repo: string; branch: string; path: string }
  token: { source: 'db' | 'env' | 'none'; last4: string | null }
}

function CheckSteps({ check }: { check: TokenCheckResult }) {
  return (
    <ul aria-label="Token check" className="space-y-1 text-xs">
      {check.steps.map((s) => (
        <li key={s.label} className="flex items-start gap-1.5">
          {s.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />}
          <span className="min-w-0 break-words">
            <span className="font-medium">{s.label}:</span> {s.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PublishSettings({ config, token }: PublishSettingsProps) {
  const [repo, setRepo] = useState(config.repo)
  const [branch, setBranch] = useState(config.branch)
  const [path, setPath] = useState(config.path)
  const [draft, setDraft] = useState('')
  const [check, setCheck] = useState<TokenCheckResult | null>(null)
  const [pending, start] = useTransition()

  const saveConfig = (): void =>
    start(async () => {
      const r = await savePublishConfigAction({ repo, branch, path })
      if ('error' in r) toast.error(r.error)
      else toast.success('Repository saved')
    })
  const saveToken = (): void =>
    start(async () => {
      const r = await savePortfolioTokenAction(draft)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setDraft('')
      setCheck(r.check)
      toast.success('Token saved')
    })
  const test = (): void =>
    start(async () => {
      const r = await testPortfolioTokenAction()
      if ('error' in r) toast.error(r.error)
      else {
        setCheck(r.check)
        if (r.check.ok) toast.success('Token OK')
        else toast.error('The token check failed')
      }
    })
  const remove = (): void =>
    start(async () => {
      const r = await removePortfolioTokenAction()
      if ('error' in r) toast.error(r.error)
      else {
        setCheck(null)
        toast.success('Token removed')
      }
    })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Repository</CardTitle>
          <CardDescription>Where your portfolio keeps profile.json.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            aria-label="Portfolio repository"
            className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              saveConfig()
            }}
          >
            <FormField htmlFor="pub-repo" label="Repository" hint="(owner/name)">
              <Input id="pub-repo" value={repo} placeholder="octocat/portfolio" onChange={(e) => setRepo(e.target.value)} />
            </FormField>
            <FormField htmlFor="pub-branch" label="Branch">
              <Input id="pub-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </FormField>
            <FormField htmlFor="pub-path" label="Path">
              <Input id="pub-path" value={path} onChange={(e) => setPath(e.target.value)} />
            </FormField>
            <FormActions>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </FormActions>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle>GitHub token</CardTitle>
            {token.source === 'db' ? (
              <Badge variant="success">Saved ••••{token.last4}</Badge>
            ) : token.source === 'env' ? (
              <Badge variant="info">Server default</Badge>
            ) : (
              <Badge variant="neutral">Not set</Badge>
            )}
          </div>
          <CardDescription>
            A fine-grained token with <strong>Contents: Read and write</strong> on this one repository only. Stored encrypted; only its last 4 characters are ever shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              saveToken()
            }}
          >
            <Input
              aria-label="GitHub token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              placeholder={token.source === 'db' ? `••••${token.last4 ?? ''}` : 'github_pat_…'}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" size="sm" className="h-9" disabled={pending || !draft}>
              {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Save
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {token.source !== 'none' ? (
              <Button type="button" variant="outline" size="sm" onClick={test} disabled={pending}>
                <PlugZap /> Test
              </Button>
            ) : null}
            {token.source === 'db' ? (
              <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
                <Trash2 /> Remove
              </Button>
            ) : null}
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Create a fine-grained token <ExternalLink className="size-3" />
            </a>
          </div>
          {check ? <CheckSteps check={check} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}
