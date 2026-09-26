'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ExternalLink, KeyRound, Loader2, PlugZap, Trash2 } from 'lucide-react'
import {
  removeServiceSecretAction,
  saveServiceSecretAction,
  testServiceSecretAction,
} from '@/app/(authed)/settings/ai/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ServiceSecretId, ServiceSecretStatus } from '@/lib/settings/service-secrets'

interface ServiceSecretsPanelProps {
  statuses: ServiceSecretStatus[]
}

type Busy = { id: ServiceSecretId; action: 'save' | 'test' | 'remove' } | null

function SourceBadge({ status }: { status: ServiceSecretStatus }) {
  if (status.source === 'db') {
    return <Badge variant="emerald">Saved{status.last4 ? ` ••••${status.last4}` : ''}</Badge>
  }
  if (status.source === 'env') return <Badge variant="blue">Server default</Badge>
  return <Badge variant="neutral">Not set</Badge>
}

/**
 * Firecrawl / Laya keys for the signed-in user. Keys are sent once, checked
 * against the service, stored encrypted and never shown again (last 4 only).
 * A saved key overrides the server's env default; removing it falls back.
 */
export function ServiceSecretsPanel({ statuses }: ServiceSecretsPanelProps) {
  const [drafts, setDrafts] = useState<Partial<Record<ServiceSecretId, string>>>({})
  const [results, setResults] = useState<Partial<Record<ServiceSecretId, string | null>>>({})
  const [busy, setBusy] = useState<Busy>(null)
  const [removing, setRemoving] = useState<ServiceSecretStatus | null>(null)
  const [, startTransition] = useTransition()

  function run(id: ServiceSecretId, action: NonNullable<Busy>['action'], fn: () => Promise<void>): void {
    setBusy({ id, action })
    startTransition(async () => {
      try {
        await fn()
      } catch {
        toast.error('Something went wrong. Please try again.')
      } finally {
        setBusy(null)
      }
    })
  }

  function save(id: ServiceSecretId): void {
    const key = drafts[id]?.trim()
    if (!key) {
      toast.error('Paste a key first.')
      return
    }
    run(id, 'save', async () => {
      const r = await saveServiceSecretAction(id, key)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setDrafts((d) => ({ ...d, [id]: '' }))
      setResults((p) => ({ ...p, [id]: r.verified ? 'Key verified.' : r.warning }))
      if (r.warning) toast.warning(r.warning)
      else toast.success('Key verified and saved.')
    })
  }

  function test(id: ServiceSecretId): void {
    run(id, 'test', async () => {
      const r = await testServiceSecretAction(id)
      setResults((p) => ({ ...p, [id]: r.ok ? 'Connection OK.' : (r.error ?? 'Connection failed.') }))
      if (r.ok) toast.success('Connection OK.')
      else toast.error(r.error ?? 'Connection failed.')
    })
  }

  function remove(status: ServiceSecretStatus): void {
    const id = status.info.id
    run(id, 'remove', async () => {
      const r = await removeServiceSecretAction(id)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setRemoving(null)
      setResults((p) => ({ ...p, [id]: null }))
      toast.success('Key removed.')
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {statuses.map((s) => {
        const id = s.info.id
        const isBusy = (a: NonNullable<Busy>['action']) => busy?.id === id && busy.action === a
        return (
          <Card key={id} className="flex flex-col">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{s.info.label}</CardTitle>
                <SourceBadge status={s} />
              </div>
              <CardDescription className="text-xs">{s.info.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  save(id)
                }}
              >
                <Label htmlFor={`secret-${id}`} className="text-xs">
                  {s.source === 'db' ? 'Replace key' : 'API key'}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`secret-${id}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={s.source === 'db' ? `••••${s.last4 ?? ''}` : 'Paste key'}
                    value={drafts[id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                    disabled={busy !== null}
                  />
                  <Button type="submit" size="sm" className="h-9" disabled={busy !== null || !drafts[id]}>
                    {isBusy('save') ? <Loader2 className="animate-spin" /> : <KeyRound />}
                    Save
                  </Button>
                </div>
              </form>
              {results[id] ? <p className="text-xs text-muted-foreground">{results[id]}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                {s.source !== 'none' && s.info.testable ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => test(id)}
                  >
                    {isBusy('test') ? <Loader2 className="animate-spin" /> : <PlugZap />}
                    Test
                  </Button>
                ) : null}
                {s.source === 'db' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => setRemoving(s)}
                  >
                    {isBusy('remove') ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Remove
                  </Button>
                ) : null}
                {s.info.keyUrl ? (
                  <a
                    href={s.info.keyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Get a key
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
              {s.source === 'env' ? (
                <p className="text-[11px] text-muted-foreground">
                  Using the server&apos;s {s.info.envKey}. Save your own key to override it.
                </p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove your ${removing?.info.label ?? ''} key?`}
        description={
          <p>
            The saved key is deleted. {removing?.info.label} then uses the server default (
            {removing?.info.envKey}) if one is set, or stays off.
          </p>
        }
        confirmLabel="Remove"
        pending={busy?.action === 'remove'}
        onConfirm={() => {
          if (removing) remove(removing)
        }}
      />
    </div>
  )
}
