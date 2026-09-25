'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Braces, Loader2, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ModelPicker, type PickerProvider } from '@/components/lab/model-picker'
import { RunResults } from '@/components/lab/run-results'
import type { ModelRef } from '@/lib/lab/providers/types'
import type { ResultView, RunView } from '@/lib/lab/views'

interface ArenaProps {
  providers: PickerProvider[]
}

type StreamEvent =
  | { type: 'start'; run: RunView }
  | { type: 'delta'; resultId: string; text: string }
  | { type: 'result'; result: ResultView }
  | { type: 'done'; run: RunView }
  | { type: 'error'; error: string }

const SCHEMA_EXAMPLE = `{
  "type": "object",
  "required": ["summary", "score"],
  "properties": {
    "summary": { "type": "string" },
    "score": { "type": "integer", "minimum": 0, "maximum": 100 }
  }
}`

/** Parse `event:`/`data:` blocks out of an SSE text buffer. Returns leftover. */
function drainSse(buffer: string, onEvent: (e: StreamEvent) => void): string {
  let rest = buffer
  let idx: number
  while ((idx = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('')
    if (!data) continue
    try {
      onEvent(JSON.parse(data) as StreamEvent)
    } catch {
      /* ignore malformed block */
    }
  }
  return rest
}

/**
 * v14 — Model Arena. One prompt → 2–6 models in parallel, streamed live.
 * Ctrl/Cmd+Enter runs. Blind mode hides model names until you vote.
 */
export function Arena({ providers }: ArenaProps) {
  const [selected, setSelected] = useState<ModelRef[]>([])
  const [system, setSystem] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schemaOn, setSchemaOn] = useState(false)
  const [schemaText, setSchemaText] = useState(SCHEMA_EXAMPLE)
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('1024')
  const [blind, setBlind] = useState(false)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<RunView | null>(null)
  const [streaming, setStreaming] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)

  const anyKeyed = providers.some((p) => !p.comingSoon && p.keySource !== 'none')

  function buildBody(): Record<string, unknown> | null {
    if (selected.length < 2) {
      toast.error('Pick at least 2 models.')
      return null
    }
    if (!prompt.trim()) {
      toast.error('Write a prompt first.')
      return null
    }
    let jsonSchema: unknown
    if (schemaOn) {
      try {
        jsonSchema = JSON.parse(schemaText)
      } catch {
        toast.error('JSON schema is not valid JSON.')
        return null
      }
      if (!jsonSchema || typeof jsonSchema !== 'object' || Array.isArray(jsonSchema)) {
        toast.error('JSON schema must be an object.')
        return null
      }
    }
    const t = Number(temperature)
    const mt = Number(maxTokens)
    return {
      system: system.trim() || undefined,
      prompt,
      jsonSchema,
      models: selected,
      blind,
      temperature: temperature.trim() && Number.isFinite(t) ? t : undefined,
      maxTokens: maxTokens.trim() && Number.isInteger(mt) && mt > 0 ? mt : undefined,
      stream: true,
    }
  }

  function applyEvent(e: StreamEvent): void {
    switch (e.type) {
      case 'start':
      case 'done':
        setRun(e.run)
        break
      case 'delta':
        setStreaming((s) => ({ ...s, [e.resultId]: (s[e.resultId] ?? '') + e.text }))
        break
      case 'result':
        setRun((r) =>
          r ? { ...r, results: r.results.map((x) => (x.id === e.result.id ? e.result : x)) } : r,
        )
        break
      case 'error':
        toast.error(e.error)
        break
    }
  }

  async function start(): Promise<void> {
    if (running) return
    const body = buildBody()
    if (!body) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    setRun(null)
    setStreaming({})
    try {
      const res = await fetch('/api/lab/arena/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(json.error ?? 'Arena run failed.')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf = drainSse(buf + decoder.decode(value, { stream: true }), applyEvent)
      }
      drainSse(`${buf}\n\n`, applyEvent)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast.error('Network error — the run was interrupted.')
      }
    } finally {
      abortRef.current = null
      setRunning(false)
    }
  }

  if (!anyKeyed) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-sm">
          <p>No provider is configured yet. Add a free API key to start comparing models.</p>
          <Button asChild size="sm">
            <Link href="/playground/models/providers">Add a provider key</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Models</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelPicker providers={providers} selected={selected} onChange={setSelected} />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Prompt</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void start()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void start()
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="arena-system">System (optional)</Label>
                <Textarea
                  id="arena-system"
                  rows={2}
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  placeholder="You are a concise career coach…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arena-prompt">Prompt</Label>
                <Textarea
                  id="arena-prompt"
                  rows={6}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask all selected models the same thing…"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={schemaOn}
                    onChange={(e) => setSchemaOn(e.target.checked)}
                  />
                  <Braces className="size-4" /> Require JSON matching a schema
                </label>
                {schemaOn ? (
                  <Textarea
                    aria-label="JSON schema"
                    rows={8}
                    className="font-mono text-xs"
                    value={schemaText}
                    onChange={(e) => setSchemaText(e.target.value)}
                    spellCheck={false}
                  />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="arena-temp">Temperature</Label>
                  <Input
                    id="arena-temp"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arena-max">Max tokens</Label>
                  <Input
                    id="arena-max"
                    type="number"
                    min={1}
                    max={8192}
                    step={1}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                  />
                </div>
                <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={blind}
                    onChange={(e) => setBlind(e.target.checked)}
                  />
                  Blind mode
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={running || selected.length < 2}>
                  {running ? <Loader2 className="animate-spin" /> : <Play />}
                  Run {selected.length > 0 ? `(${selected.length})` : ''}
                </Button>
                {running ? (
                  <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
                    <Square /> Stop
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter</span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {run ? (
        <section aria-label="Results" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Results</h2>
            <Link href={`/playground/models/runs/${run.id}`} className="text-xs text-muted-foreground hover:text-foreground">
              Saved as run · open
            </Link>
          </div>
          <RunResults run={run} streaming={streaming} onRunChange={setRun} />
        </section>
      ) : null}
    </div>
  )
}
