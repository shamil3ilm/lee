'use client'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Search, Star, X } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fmtContext } from '@/lib/lab/format'
import type { KeySource, ModelInfo, ModelRef, ProviderId } from '@/lib/lab/providers/types'
import { cn } from '@/lib/utils'

export interface PickerProvider {
  id: ProviderId
  label: string
  keySource: KeySource
  comingSoon: boolean
  freeTierNote: string
}

interface ProviderModels {
  status: 'idle' | 'loading' | 'ready' | 'error'
  models: ModelInfo[]
  error?: string
}

interface ModelPickerProps {
  providers: PickerProvider[]
  selected: ModelRef[]
  onChange: (next: ModelRef[]) => void
  max?: number
}

async function fetchModelList(provider: ProviderId, refresh: boolean): Promise<ProviderModels> {
  try {
    const res = await fetch(`/api/lab/models?provider=${provider}${refresh ? '&refresh=1' : ''}`)
    const json = (await res.json().catch(() => ({}))) as { models?: ModelInfo[]; error?: string }
    if (!res.ok) return { status: 'error', models: [], error: json.error ?? 'Could not load models.' }
    if (json.error) return { status: 'error', models: [], error: json.error }
    return { status: 'ready', models: json.models ?? [] }
  } catch {
    return { status: 'error', models: [], error: 'Network error.' }
  }
}

const isKeyed = (p: PickerProvider) => !p.comingSoon && p.keySource !== 'none'

/**
 * v14 — multi-select of live models grouped by provider. Recommended first,
 * searchable, "free only" filter. Providers without a key show a link to
 * the Providers page; browser providers show "coming soon".
 */
export function ModelPicker({ providers, selected, onChange, max = 6 }: ModelPickerProps) {
  const [lists, setLists] = useState<Partial<Record<ProviderId, ProviderModels>>>(() =>
    Object.fromEntries(
      providers.filter(isKeyed).map((p) => [p.id, { status: 'loading', models: [] } as ProviderModels]),
    ),
  )
  const [open, setOpen] = useState<Partial<Record<ProviderId, boolean>>>(() =>
    Object.fromEntries(providers.filter(isKeyed).map((p) => [p.id, true])),
  )
  const [query, setQuery] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)

  useEffect(() => {
    let cancelled = false
    for (const p of providers.filter(isKeyed)) {
      void fetchModelList(p.id, false).then((r) => {
        if (!cancelled) setLists((prev) => ({ ...prev, [p.id]: r }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [providers])

  async function refresh(provider: ProviderId): Promise<void> {
    setLists((prev) => ({ ...prev, [provider]: { status: 'loading', models: prev[provider]?.models ?? [] } }))
    const r = await fetchModelList(provider, true)
    setLists((prev) => ({ ...prev, [provider]: r }))
  }

  const selectedKeys = useMemo(() => new Set(selected.map((s) => `${s.provider}:${s.model}`)), [selected])
  const q = query.trim().toLowerCase()

  function toggle(ref: ModelRef): void {
    const k = `${ref.provider}:${ref.model}`
    if (selectedKeys.has(k)) onChange(selected.filter((s) => `${s.provider}:${s.model}` !== k))
    else if (selected.length < max) onChange([...selected, ref])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="pl-8"
            aria-label="Search models"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
          />
          Free only
        </label>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Selected models">
          {selected.map((s) => (
            <Badge key={`${s.provider}:${s.model}`} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[16rem] truncate">
                {s.provider}/{s.model}
              </span>
              <button
                type="button"
                aria-label={`Remove ${s.model}`}
                className="rounded p-0.5 hover:bg-background"
                onClick={() => toggle(s)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {selected.length}/{max} selected — pick at least 2.
      </p>

      <div className="max-h-[28rem] divide-y overflow-y-auto rounded-md border">
        {providers.map((p) => {
          const state = lists[p.id]
          const isOpen = Boolean(open[p.id])
          const models = (state?.models ?? []).filter(
            (m) =>
              (!freeOnly || m.free) &&
              (!q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)),
          )
          return (
            <div key={p.id}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
                  onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                  aria-expanded={isOpen}
                  disabled={!isKeyed(p)}
                >
                  {isKeyed(p) ? (
                    isOpen ? (
                      <ChevronDown className="size-4 shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" />
                    )
                  ) : null}
                  <span className="truncate">{p.label}</span>
                  {state?.status === 'ready' ? (
                    <span className="text-xs font-normal text-muted-foreground">({models.length})</span>
                  ) : null}
                </button>
                {p.comingSoon ? (
                  <Badge variant="slate">Coming soon</Badge>
                ) : p.keySource === 'none' ? (
                  <Link href="/lab/providers" className="text-xs text-primary underline-offset-4 hover:underline">
                    Add key
                  </Link>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Refresh ${p.label} models`}
                    disabled={state?.status === 'loading'}
                    onClick={() => void refresh(p.id)}
                  >
                    {state?.status === 'loading' ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
              {isOpen && isKeyed(p) ? (
                <div className="pb-2">
                  {state?.status === 'error' ? (
                    <p className="px-3 py-1 text-xs text-rose-600">{state.error}</p>
                  ) : null}
                  {state?.status === 'ready' && models.length === 0 ? (
                    <p className="px-3 py-1 text-xs text-muted-foreground">No models match.</p>
                  ) : null}
                  <ul className="space-y-0.5 px-1">
                    {models.slice(0, 200).map((m) => {
                      const checked = selectedKeys.has(`${p.id}:${m.id}`)
                      const disabled = !checked && selected.length >= max
                      return (
                        <li key={m.id}>
                          <label
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent',
                              disabled && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 shrink-0 accent-primary"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggle({ provider: p.id, model: m.id })}
                            />
                            <span className="min-w-0 flex-1 truncate" title={m.id}>
                              {m.label !== m.id ? `${m.label}` : m.id}
                            </span>
                            {m.recommended ? (
                              <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Recommended" />
                            ) : null}
                            {m.free ? (
                              <span className="shrink-0 text-[10px] font-medium uppercase text-emerald-600">free</span>
                            ) : null}
                            {m.contextLength ? (
                              <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
                                {fmtContext(m.contextLength)}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
