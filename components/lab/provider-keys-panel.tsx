'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, KeyRound, Loader2, PlugZap, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyStatusBadge } from '@/components/lab/key-status-badge'
import type { ProviderStatus } from '@/lib/lab/status'
import type { ProviderId } from '@/lib/lab/providers/types'

/**
 * v14 — add / replace / remove provider API keys. Keys are sent once to the
 * server, validated there, stored encrypted, and never come back: the UI only
 * ever shows `••••last4`. Reusable — slated to move into Settings › AI.
 */

interface ProviderKeysPanelProps {
  initialStatuses: ProviderStatus[]
}

type Busy = { provider: ProviderId; action: 'save' | 'remove' | 'test' } | null

async function readError(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  return json.error ?? fallback
}

export function ProviderKeysPanel({ initialStatuses }: ProviderKeysPanelProps) {
  const router = useRouter()
  const [statuses, setStatuses] = useState<ProviderStatus[]>(initialStatuses)
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({})
  const [busy, setBusy] = useState<Busy>(null)

  function patch(provider: ProviderId, next: Partial<ProviderStatus>): void {
    setStatuses((prev) => prev.map((s) => (s.info.id === provider ? { ...s, ...next } : s)))
  }

  async function save(provider: ProviderId): Promise<void> {
    const key = drafts[provider]?.trim()
    if (!key) {
      toast.error('Paste a key first.')
      return
    }
    setBusy({ provider, action: 'save' })
    try {
      const res = await fetch('/api/lab/providers/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      })
      if (!res.ok) {
        toast.error(await readError(res, 'Could not save the key.'))
        return
      }
      const json = (await res.json()) as { last4: string }
      patch(provider, { keySource: 'db', last4: json.last4, reachable: true, reachError: null })
      setDrafts((d) => ({ ...d, [provider]: '' }))
      toast.success('Key verified and saved.')
      router.refresh()
    } catch {
      toast.error('Network error — key not saved.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(status: ProviderStatus): Promise<void> {
    const provider = status.info.id
    setBusy({ provider, action: 'remove' })
    try {
      const res = await fetch(`/api/lab/providers/keys?provider=${provider}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(await readError(res, 'Could not remove the key.'))
        return
      }
      // Re-read status: removing a saved key may fall back to an env key.
      const fresh = await fetch('/api/lab/providers').catch(() => null)
      const json = fresh?.ok
        ? ((await fresh.json().catch(() => null)) as { providers?: ProviderStatus[] } | null)
        : null
      if (json?.providers) setStatuses(json.providers)
      else patch(provider, { keySource: 'none', last4: null, reachable: null })
      toast.success('Key removed.')
      router.refresh()
    } catch {
      toast.error('Network error — key not removed.')
    } finally {
      setBusy(null)
    }
  }

  async function test(provider: ProviderId): Promise<void> {
    setBusy({ provider, action: 'test' })
    try {
      const res = await fetch('/api/lab/providers/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string | null }
      patch(provider, { reachable: Boolean(json.ok), reachError: json.error ?? null })
      if (json.ok) toast.success('Connection OK.')
      else toast.error(json.error ?? 'Connection failed.')
    } catch {
      toast.error('Network error — could not test.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {statuses.map((s) => {
        const id = s.info.id
        const isBusy = (a: NonNullable<Busy>['action']) => busy?.provider === id && busy.action === a
        const serverKeyed = s.info.runsIn === 'server' && !s.info.comingSoon && s.info.needsKey
        return (
          <Card key={id} className="flex flex-col">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{s.info.label}</CardTitle>
                <KeyStatusBadge
                  keySource={s.keySource}
                  last4={s.last4}
                  needsKey={s.info.needsKey}
                  comingSoon={s.info.comingSoon}
                />
              </div>
              <CardDescription className="text-xs">{s.info.freeTierNote}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              {serverKeyed ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void save(id)
                  }}
                >
                  <Label htmlFor={`key-${id}`} className="text-xs">
                    {s.keySource === 'db' ? 'Replace key' : 'API key'}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${id}`}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={s.keySource === 'db' ? `••••${s.last4 ?? ''}` : 'Paste key'}
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
              ) : null}
              {s.reachable !== null ? (
                <p className={s.reachable ? 'text-xs text-emerald-600' : 'text-xs text-rose-600'}>
                  {s.reachable ? 'Reachable' : (s.reachError ?? 'Unreachable')}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {serverKeyed && s.keySource !== 'none' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void test(id)}
                  >
                    {isBusy('test') ? <Loader2 className="animate-spin" /> : <PlugZap />}
                    Test connection
                  </Button>
                ) : null}
                {s.keySource === 'db' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void remove(s)}
                  >
                    {isBusy('remove') ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Remove
                  </Button>
                ) : null}
                <a
                  href={s.info.keyUrl ?? s.info.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {s.info.keyUrl ? 'Get a key' : 'Docs'}
                  <ExternalLink className="size-3" />
                </a>
              </div>
              {s.keySource === 'env' ? (
                <p className="text-[11px] text-muted-foreground">
                  Using the server&apos;s {s.info.envKey}. Save your own key to override it.
                </p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
