'use client'
import { useMemo, useState, useTransition, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Beaker, ChevronDown, ChevronRight, Loader2, Play, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'
import { cn } from '@/lib/utils'
import { UsageBadge } from '@/components/ai/usage-badge'
import type { AiUsage } from '@/lib/ai/usage-types'

type ProviderKind = 'heuristic' | 'groq' | 'laya'
type DecisionType = 'choice' | 'yesNo' | 'score'

interface ResultRow {
  provider: ProviderKind
  ok: boolean
  latencyMs: number
  result?: {
    pick?: string
    confidence?: number
    answer?: boolean
    score?: number
  }
  error?: string
  raw?: unknown
  usage?: AiUsage | null
}

const PROVIDER_LABEL: Record<ProviderKind, string> = {
  heuristic: 'Heuristic',
  groq: 'Groq',
  laya: 'Laya',
}

/**
 * Hand-picked test scenarios. Kept in the component (not extracted) because
 * they're UI copy — English-language examples that only make sense next to
 * the form they pre-fill. Move them out if a second surface ever needs them.
 */
const PRESETS: Preset[] = [
  {
    label: 'Expense: Netflix subscription',
    type: 'choice',
    text: 'Netflix monthly subscription',
    options: [...EXPENSE_CATEGORIES],
    context: 'Vendor: Netflix',
  },
  {
    label: 'Expense: DEWA bill (regional)',
    type: 'choice',
    text: 'DEWA bill October',
    options: [...EXPENSE_CATEGORIES],
    context: 'Vendor: DEWA',
  },
  {
    label: 'Discovery pre-filter: senior BE role',
    type: 'yesNo',
    text: 'Senior Backend Engineer, PHP/Laravel, fintech, Dubai. Remote OK. $150k.',
    question:
      'Is this job likely a strong match for a senior PHP/Laravel fintech engineer based in Dubai?',
  },
  {
    label: 'Discovery pre-filter: junior React role',
    type: 'yesNo',
    text: 'Junior React developer, San Francisco onsite only, 2-3 yrs exp, $90k.',
    question:
      'Is this job likely a strong match for a senior PHP/Laravel fintech engineer based in Dubai?',
  },
  {
    label: 'Email triage: recruiter reply',
    type: 'yesNo',
    text: 'Hi Shamil, thanks for applying. We would like to schedule a screening call next week. Would Tuesday 3pm UAE time work?',
    question: 'Is this email a genuine recruiter outreach worth logging as an activity?',
  },
  {
    label: 'Urgency score: payment issue',
    type: 'score',
    text: 'Customer says they were charged twice on invoice 4411, threatens to cancel their plan',
    rubric: 'How urgent is this customer issue?',
    scale: [0, 5],
  },
]

interface Preset {
  label: string
  type: DecisionType
  text: string
  options?: string[]
  context?: string
  question?: string
  rubric?: string
  scale?: [number, number]
}

interface DecisionPlaygroundProps {
  defaultLayaEndpoint: string | null
}

const NO_PRESET = '__none__'

export function DecisionPlayground({ defaultLayaEndpoint }: DecisionPlaygroundProps) {
  const [type, setType] = useState<DecisionType>('choice')
  const [text, setText] = useState('')
  // choice
  const [optionsText, setOptionsText] = useState('')
  const [optionDescriptionsText, setOptionDescriptionsText] = useState('')
  const [context, setContext] = useState('')
  // yesNo
  const [question, setQuestion] = useState('')
  // score
  const [rubric, setRubric] = useState('')
  const [scaleMin, setScaleMin] = useState<number>(0)
  const [scaleMax, setScaleMax] = useState<number>(5)
  // providers
  const [useHeuristic, setUseHeuristic] = useState(true)
  const [useGroq, setUseGroq] = useState(true)
  const [useLaya, setUseLaya] = useState(true)
  const [layaEndpoint, setLayaEndpoint] = useState('')
  // results
  const [results, setResults] = useState<ResultRow[]>([])
  const [pending, start] = useTransition()

  function resetTypeSpecificFields(): void {
    setText('')
    setOptionsText('')
    setOptionDescriptionsText('')
    setContext('')
    setQuestion('')
    setRubric('')
    setScaleMin(0)
    setScaleMax(5)
    setResults([])
  }

  function handleTypeChange(next: string): void {
    if (next === 'choice' || next === 'yesNo' || next === 'score') {
      setType(next)
      resetTypeSpecificFields()
    }
  }

  function applyPreset(labelKey: string): void {
    if (labelKey === NO_PRESET) return
    const p = PRESETS.find((x) => x.label === labelKey)
    if (!p) return
    setType(p.type)
    setText(p.text)
    setContext(p.context ?? '')
    setOptionsText(p.options?.join(', ') ?? '')
    setOptionDescriptionsText('')
    setQuestion(p.question ?? '')
    setRubric(p.rubric ?? '')
    setScaleMin(p.scale?.[0] ?? 0)
    setScaleMax(p.scale?.[1] ?? 5)
    setResults([])
  }

  function parseOptions(): string[] {
    return optionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  function parseOptionDescriptions(): Record<string, string> | undefined {
    const lines = optionDescriptionsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return undefined
    const map: Record<string, string> = {}
    for (const line of lines) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (key && value) map[key] = value
    }
    return Object.keys(map).length ? map : undefined
  }

  function selectedProviders(): ProviderKind[] {
    const out: ProviderKind[] = []
    if (useHeuristic) out.push('heuristic')
    if (useGroq) out.push('groq')
    if (useLaya) out.push('laya')
    return out
  }

  function loadExpenseCategories(): void {
    setOptionsText([...EXPENSE_CATEGORIES].join(', '))
  }

  function run(): void {
    const providers = selectedProviders()
    if (providers.length === 0) {
      toast.error('Pick at least one provider to run.')
      return
    }
    if (!text.trim()) {
      toast.error('Enter some input text to classify.')
      return
    }
    // Client-side gates that mirror the server schema. Server still validates
    // — this is only to save a round-trip on obvious mistakes.
    if (type === 'choice') {
      const opts = parseOptions()
      if (opts.length < 2) {
        toast.error('Choice needs at least 2 options (comma-separated).')
        return
      }
    }
    if (type === 'yesNo' && !question.trim()) {
      toast.error('Yes/No needs a question.')
      return
    }
    if (type === 'score') {
      if (!rubric.trim()) {
        toast.error('Score needs a rubric.')
        return
      }
      if (!(scaleMax > scaleMin)) {
        toast.error('Score scale max must be greater than min.')
        return
      }
    }

    const body: Record<string, unknown> = {
      type,
      text,
      providers,
    }
    if (type === 'choice') {
      body.options = parseOptions()
      const descs = parseOptionDescriptions()
      if (descs) body.optionDescriptions = descs
      if (context.trim()) body.context = context
    } else if (type === 'yesNo') {
      body.question = question
      if (context.trim()) body.context = context
    } else {
      body.rubric = rubric
      body.scale = [scaleMin, scaleMax]
      if (context.trim()) body.context = context
    }
    if (useLaya && layaEndpoint.trim()) {
      body.layaEndpoint = layaEndpoint.trim()
    }

    start(async () => {
      try {
        const res = await fetch('/api/decisions/playground', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error(err.error ?? 'Could not run decision.')
          return
        }
        const json = (await res.json()) as { results: ResultRow[] }
        setResults(json.results)
      } catch {
        toast.error('Network error — could not reach the playground API.')
      }
    })
  }

  function onTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // Ctrl+Enter / Cmd+Enter → run.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  }

  const disagreement = useMemo(() => detectDisagreement(results, type), [results, type])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* LEFT — Form */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Beaker className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Input</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-auto sm:flex-1">
              <Select value={NO_PRESET} onValueChange={applyPreset}>
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Load preset scenario…" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRESET}>Load preset scenario…</SelectItem>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.label} value={p.label}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs value={type} onValueChange={handleTypeChange}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="choice">Choice</TabsTrigger>
              <TabsTrigger value="yesNo">Yes / No</TabsTrigger>
              <TabsTrigger value="score">Score</TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-1">
              <label className="text-xs font-medium" htmlFor="dp-text">
                Input text (the state to classify)
              </label>
              <Textarea
                id="dp-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onTextKeyDown}
                placeholder="e.g. Netflix monthly subscription"
                className="min-h-[80px]"
              />
              <p className="text-[11px] text-muted-foreground">
                Press Ctrl / Cmd + Enter to run.
              </p>
            </div>

            <TabsContent value="choice" className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium" htmlFor="dp-options">
                    Options (comma-separated)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={loadExpenseCategories}
                  >
                    Load expense categories
                  </Button>
                </div>
                <Textarea
                  id="dp-options"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="subscription, dining, groceries, other"
                />
                <OptionChips options={parseOptions()} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-descs">
                  Option descriptions (optional, one per line, <code>key: description</code>)
                </label>
                <Textarea
                  id="dp-descs"
                  value={optionDescriptionsText}
                  onChange={(e) => setOptionDescriptionsText(e.target.value)}
                  placeholder="subscription: recurring services like SaaS or streaming"
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-context">
                  Context (optional)
                </label>
                <Input
                  id="dp-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Vendor: Netflix"
                />
              </div>
            </TabsContent>

            <TabsContent value="yesNo" className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-question">
                  Question
                </label>
                <Input
                  id="dp-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Is this job a strong match?"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-yn-context">
                  Context (optional)
                </label>
                <Input
                  id="dp-yn-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Extra info the model should consider"
                />
              </div>
            </TabsContent>

            <TabsContent value="score" className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-rubric">
                  Rubric
                </label>
                <Input
                  id="dp-rubric"
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  placeholder="How urgent is this?"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="dp-min">
                    Scale min
                  </label>
                  <Input
                    id="dp-min"
                    type="number"
                    value={scaleMin}
                    onChange={(e) => setScaleMin(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="dp-max">
                    Scale max
                  </label>
                  <Input
                    id="dp-max"
                    type="number"
                    value={scaleMax}
                    onChange={(e) => setScaleMax(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-sc-context">
                  Context (optional)
                </label>
                <Input
                  id="dp-sc-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Extra info the model should consider"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <div className="text-xs font-medium">Providers to run</div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useHeuristic}
                  onChange={(e) => setUseHeuristic(e.target.checked)}
                />
                Heuristic
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useGroq}
                  onChange={(e) => setUseGroq(e.target.checked)}
                />
                Groq
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useLaya}
                  onChange={(e) => setUseLaya(e.target.checked)}
                />
                Laya
              </label>
            </div>
            {useLaya ? (
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="dp-laya-endpoint">
                  Laya endpoint (override)
                </label>
                <Input
                  id="dp-laya-endpoint"
                  type="url"
                  value={layaEndpoint}
                  onChange={(e) => setLayaEndpoint(e.target.value)}
                  placeholder={
                    defaultLayaEndpoint ?? 'https://convaiinnovations-laya-demo.hf.space'
                  }
                />
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            onClick={run}
            disabled={pending}
            className="w-full"
            size="lg"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Running…
              </>
            ) : (
              <>
                <Play className="size-4" /> Run
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* RIGHT — Results */}
      <div className="space-y-3">
        {results.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-[300px] items-center justify-center p-8 text-sm text-muted-foreground">
              Run a decision to see results.
            </CardContent>
          </Card>
        ) : (
          <>
            {disagreement ? (
              <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                Providers disagreed on the answer.
              </div>
            ) : null}
            {results.map((r) => (
              <ResultCard key={r.provider} row={r} highlight={disagreement} type={type} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function OptionChips({ options }: { options: string[] }) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Badge key={o} variant="secondary" className="text-[11px]">
          {o}
        </Badge>
      ))}
    </div>
  )
}

function ResultCard({
  row,
  highlight,
  type,
}: {
  row: ResultRow
  highlight: boolean
  type: DecisionType
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card
      className={cn(
        highlight && row.ok
          ? 'border-warning/30'
          : undefined,
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              {PROVIDER_LABEL[row.provider]}
            </CardTitle>
            {row.ok ? (
              <Badge variant="emerald">ok</Badge>
            ) : (
              <Badge variant="destructive">error</Badge>
            )}
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {row.latencyMs}ms
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {row.ok ? (
          <div className="space-y-2">
            {type === 'choice' ? (
              <div className="flex items-baseline gap-3">
                <div className="text-xl font-semibold">{row.result?.pick ?? '—'}</div>
                {typeof row.result?.confidence === 'number' ? (
                  <Badge variant="slate" className="text-[11px]">
                    conf {row.result.confidence.toFixed(2)}
                  </Badge>
                ) : null}
              </div>
            ) : null}
            {type === 'yesNo' ? (
              <div className="flex items-baseline gap-3">
                <div className="text-xl font-semibold">
                  {row.result?.answer ? 'Yes' : 'No'}
                </div>
                {typeof row.result?.confidence === 'number' ? (
                  <Badge variant="slate" className="text-[11px]">
                    conf {row.result.confidence.toFixed(2)}
                  </Badge>
                ) : null}
              </div>
            ) : null}
            {type === 'score' ? (
              <div className="text-xl font-semibold">
                {typeof row.result?.score === 'number'
                  ? row.result.score.toFixed(2)
                  : '—'}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {row.error ?? 'Provider failed.'}
          </div>
        )}
        <UsageBadge usage={row.usage} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          Raw response
        </button>
        {open ? (
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-tight">
            {safeJson(row.raw ?? { ok: row.ok, error: row.error, result: row.result })}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  )
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/**
 * Consider providers "disagreed" when at least two successful rows produced
 * different primary answers. Ignores errored rows so a single failing
 * provider doesn't flag the whole set as disagreement.
 */
function detectDisagreement(rows: ResultRow[], type: DecisionType): boolean {
  const successful = rows.filter((r) => r.ok)
  if (successful.length < 2) return false
  const key = (r: ResultRow): string => {
    if (type === 'choice') return String(r.result?.pick ?? '')
    if (type === 'yesNo') return String(r.result?.answer ?? '')
    // For score, treat "disagreement" as >0.5 apart. Do it via a
    // discretized bucket key so the same Set-uniqueness check applies.
    const s = r.result?.score
    if (typeof s !== 'number') return ''
    return String(Math.round(s * 2))
  }
  const keys = new Set(successful.map(key))
  return keys.size > 1
}
