import { randomInt } from 'node:crypto'
import { z } from 'zod'
import * as runsQ from '@/lib/db/queries/labRuns'
import { hashPrompt } from '@/lib/ai/prompts/hash'
import { ARENA_PROVIDER_IDS } from './providers/catalog'
import { MissingKeyError, ProviderError, RateLimitedError, safeErrorMessage } from './providers/errors'
import { callModel } from './providers/registry'
import type { ChatRequest, ProviderId } from './providers/types'
import { PROVIDER_IDS } from './providers/types'
import { checkOutput } from './schema-check'
import { logLabCall } from './log'
import {
  BLIND_LABELS,
  toResultView,
  toRunView,
  type ArenaConfig,
  type ErrorKind,
  type ResultView,
  type RunView,
  type StoredMetrics,
} from './views'

/**
 * v14 — Model Arena: one prompt → 2–6 models in parallel. Every result is
 * persisted (placeholder rows first so streaming clients get stable ids),
 * every call is logged to ai_call_logs with kind `lab_arena`.
 */

export const ARENA_KIND = 'lab_arena'

const modelRefSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().trim().min(1).max(200),
})

export const arenaRunInputSchema = z
  .object({
    system: z.string().max(20_000).optional(),
    prompt: z.string().trim().min(1, 'Prompt is required').max(50_000),
    jsonSchema: z.record(z.string(), z.unknown()).optional(),
    models: z.array(modelRefSchema).min(2, 'Pick at least 2 models').max(6, 'At most 6 models'),
    blind: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(8192).optional(),
    stream: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>()
    v.models.forEach((m, i) => {
      if (!ARENA_PROVIDER_IDS.includes(m.provider)) {
        ctx.addIssue({
          code: 'custom',
          path: ['models', i, 'provider'],
          message: `${m.provider} is not available in the Arena yet`,
        })
      }
      const k = `${m.provider}:${m.model}`
      if (seen.has(k)) {
        ctx.addIssue({ code: 'custom', path: ['models', i], message: 'Duplicate model' })
      }
      seen.add(k)
    })
  })

export type ArenaRunInput = z.infer<typeof arenaRunInputSchema>

export type ArenaEvent =
  | { type: 'start'; run: RunView }
  | { type: 'delta'; resultId: string; text: string }
  | { type: 'result'; result: ResultView }
  | { type: 'done'; run: RunView }

export interface RunArenaOptions {
  onEvent?: (e: ArenaEvent) => void
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return out
}

export function classifyError(e: unknown): ErrorKind {
  if (e instanceof RateLimitedError) return 'rate_limited'
  if (e instanceof MissingKeyError) return 'missing_key'
  if (e instanceof ProviderError) {
    if (e.code === 'auth') return 'auth'
    if (e.code === 'timeout') return 'timeout'
  }
  return 'error'
}

export async function runArena(
  userId: string,
  input: ArenaRunInput,
  opts: RunArenaOptions = {},
): Promise<RunView> {
  const emit = opts.onEvent ?? (() => {})
  const blind = input.blind
  const order = blind ? shuffle(input.models) : [...input.models]
  const config: ArenaConfig = {
    system: input.system || undefined,
    prompt: input.prompt,
    jsonSchema: input.jsonSchema,
    models: input.models,
    blind,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  }
  const run = await runsQ.createRun(userId, 'arena', config)
  const placeholders = await runsQ.insertResults(
    run.id,
    order.map((m, i) => ({
      modelProvider: m.provider,
      modelId: m.model,
      blindLabel: blind ? (BLIND_LABELS[i] ?? null) : null,
    })),
  )
  emit({ type: 'start', run: toRunView(run, placeholders) })

  const req: ChatRequest = {
    system: config.system,
    messages: [{ role: 'user', content: input.prompt }],
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    jsonSchema: input.jsonSchema,
  }
  const promptHash = hashPrompt(`${config.system ?? ''}\n---\n${input.prompt}`)

  await Promise.allSettled(
    placeholders.map(async (row) => {
      const provider = row.modelProvider as ProviderId
      const started = performance.now()
      let patch: Parameters<typeof runsQ.updateResult>[2]
      try {
        const res = await callModel(userId, provider, row.modelId, req, {
          stream: Boolean(opts.onEvent),
          onDelta: opts.onEvent ? (text) => emit({ type: 'delta', resultId: row.id, text }) : undefined,
          fetchImpl: opts.fetchImpl,
          signal: opts.signal,
        })
        const metrics: StoredMetrics = { ...res.metrics }
        let schemaValid: boolean | null = null
        let outputJson: unknown = null
        if (input.jsonSchema) {
          const check = checkOutput(res.text, input.jsonSchema)
          schemaValid = check.valid
          outputJson = check.parsed ?? null
          if (!check.valid) metrics.schemaErrors = check.errors.slice(0, 10)
        }
        patch = { output: res.text, outputJson, metrics, schemaValid, error: null }
        await logLabCall({
          userId,
          provider,
          model: row.modelId,
          kind: ARENA_KIND,
          status: 'ok',
          latencyMs: res.metrics.totalMs,
          promptTokens: res.metrics.inputTokens,
          completionTokens: res.metrics.outputTokens,
          promptHash,
        })
      } catch (e) {
        const kind = classifyError(e)
        const message = safeErrorMessage(e)
        const totalMs = Math.round(performance.now() - started)
        patch = { output: null, metrics: { totalMs, errorKind: kind }, error: message }
        await logLabCall({
          userId,
          provider,
          model: row.modelId,
          kind: ARENA_KIND,
          status: kind === 'rate_limited' ? 'rate_limited' : 'error',
          latencyMs: totalMs,
          error: message,
          promptHash,
        })
      }
      const updated = await runsQ.updateResult(run.id, row.id, patch)
      if (updated) emit({ type: 'result', result: toResultView(updated, blind) })
    }),
  )

  const final = await runsQ.getRunWithResults(userId, run.id)
  const view = toRunView(run, final?.results ?? placeholders)
  emit({ type: 'done', run: view })
  return view
}
