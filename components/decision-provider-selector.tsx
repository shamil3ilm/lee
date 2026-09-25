'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Cog, Loader2 } from 'lucide-react'
import { saveDecisionProviderAction } from '@/app/(authed)/settings/profile/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DecisionProviderSelectorProps {
  currentProvider: string | null
  currentLayaEndpoint: string | null
}

const USE_ENV_VALUE = '__env_default__'
const PROVIDER_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: USE_ENV_VALUE, label: 'Use server default', hint: '' },
  {
    value: 'groq',
    label: 'Groq (default)',
    hint: 'Structured JSON via existing Groq key. Falls back to heuristic on error.',
  },
  {
    value: 'heuristic',
    label: 'Heuristic (keyword-only)',
    hint: 'Deterministic keyword map — zero latency, zero cost, no LLM call.',
  },
  {
    value: 'laya',
    label: 'Laya HTTP',
    hint: 'Self-hosted or public Laya Space. Falls back to Groq → heuristic on error.',
  },
]

export function DecisionProviderSelector({
  currentProvider,
  currentLayaEndpoint,
}: DecisionProviderSelectorProps) {
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<string>(currentProvider ?? USE_ENV_VALUE)
  const [layaEndpoint, setLayaEndpoint] = useState<string>(currentLayaEndpoint ?? '')

  function persist(nextProvider: string, nextEndpoint: string): void {
    start(async () => {
      const fd = new FormData()
      fd.set('provider', nextProvider === USE_ENV_VALUE ? '' : nextProvider)
      // Only meaningful for laya — server ignores it otherwise, but sending
      // keeps the round-trip symmetric with what the input shows.
      fd.set('layaEndpoint', nextProvider === 'laya' ? nextEndpoint : '')
      const result = await saveDecisionProviderAction(fd)
      if ('success' in result) toast.success('Decision provider updated')
      else toast.error(result.error)
    })
  }

  function handleProviderChange(value: string): void {
    setSelected(value)
    // Autosave on provider change to match the AI Model selector ergonomics.
    // For 'laya' we still save immediately so the enum flips; the endpoint
    // input then becomes editable and its own onBlur commits any tweak.
    persist(value, layaEndpoint)
  }

  function handleReset(): void {
    setSelected(USE_ENV_VALUE)
    setLayaEndpoint('')
    persist(USE_ENV_VALUE, '')
  }

  const activeHint = PROVIDER_OPTIONS.find((o) => o.value === selected)?.hint

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Cog className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Decision provider</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Used for classification tasks — expense auto-categorize, discovery
          pre-filter. Default: Groq (works via the existing key). Advanced:
          Laya via HTTP.
        </p>
        <Select value={selected} onValueChange={handleProviderChange} disabled={pending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeHint ? (
          <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            {activeHint}
          </div>
        ) : null}
        {selected === 'laya' ? (
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="laya-endpoint">
              Laya endpoint URL
            </label>
            <Input
              id="laya-endpoint"
              type="url"
              placeholder="https://convaiinnovations-laya-demo.hf.space"
              value={layaEndpoint}
              onChange={(e) => setLayaEndpoint(e.target.value)}
              onBlur={() => persist(selected, layaEndpoint)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the server default (env <code>LAYA_ENDPOINT</code>
              {' '}or the public demo Space if unset).
            </p>
          </div>
        ) : null}
        {pending ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> saving…
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={pending || (selected === USE_ENV_VALUE && layaEndpoint === '')}
        >
          Reset to server default
        </Button>
      </CardContent>
    </Card>
  )
}
