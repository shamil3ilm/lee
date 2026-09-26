import type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'
import { LayaUnavailableError } from './types'
import { fetchWithTimeout, LAYA_TIMEOUT_MS } from '@/lib/net/timeout'

/**
 * Laya decision provider — HTTP client for the public Laya Gradio Space
 * (or any compatible endpoint set via LAYA_ENDPOINT).
 *
 * v8.1: real implementation. Talks to a Gradio 6.x Space using the
 * two-step call pattern:
 *
 *   1. POST /gradio_api/call/{fn_name}  { data: [...] } → { event_id }
 *   2. GET  /gradio_api/call/{fn_name}/{event_id}       → SSE stream
 *
 * The default endpoint is the public demo Space
 * `https://convaiinnovations-laya-demo.hf.space`; override with the
 * LAYA_ENDPOINT env var to point at a self-hosted mirror.
 *
 * Every error path throws `LayaUnavailableError` so the composed chain
 * provider in ./index.ts cleanly falls back to Groq → heuristic without
 * callers needing to catch. Do not throw anything else from this class.
 */

const DEFAULT_ENDPOINT = 'https://convaiinnovations-laya-demo.hf.space'
const FUNCTION_NAME = 'run_playground'

type LayaAnswer = {
  // Laya's actual response uses `choice` for the picked option (matching the
  // "typed choice" API name), not `pick`. `pick` is accepted as a legacy
  // alias in case newer Laya versions rename it back.
  choice?: string
  pick?: string
  // Jev-compatible `noul` answers carry the probability the statement is
  // true in a field literally named `noul` (0–1). See docs.typesafe.ai/api.
  noul?: number
  probabilities?: Record<string, number>
  probability?: number
  confidence?: number
  // Laya: probability of the reported answer — the one calibrated number on
  // every question type. Its `confidence` is 1 − normalised entropy, which
  // does not match Jev's definition, so thresholds must not mix them.
  answer_confidence?: number
  value?: number
  score?: number
}

type LayaRaw =
  | { answers?: Record<string, LayaAnswer> }
  | Record<string, LayaAnswer>
  | LayaAnswer[]

export class LayaHttpDecisionProvider implements DecisionProvider {
  private readonly endpoint: string
  private readonly apiKey?: string

  constructor(endpoint?: string, apiKey?: string) {
    this.endpoint = (endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')
    this.apiKey = apiKey
  }

  /**
   * v10 — log every completed Laya decision call so it shows up in analytics
   * alongside Gemini/Groq generations. Best-effort — logging must never
   * break the call. Called from choice/yesNo/score after the SSE round-trip.
   *
   * v10.1 — returns the inserted row's id so a caller can capture it for a
   * downstream foreign-key linkage (currently unused by the expense classify
   * path but kept symmetric with the Gemini/Groq providers). Returns null
   * when logging fails so callers never depend on the id existing.
   */
  private async logCall(
    kind: string,
    status: 'ok' | 'error',
    latency: number,
    error?: string,
  ): Promise<string | null> {
    try {
      const { db } = await import('@/lib/db/client')
      const { aiCallLogs } = await import('@/lib/db/schema')
      const inserted = await db
        .insert(aiCallLogs)
        .values({
          provider: 'laya',
          kind,
          latencyMs: latency,
          status,
          error: error ?? null,
        })
        .returning()
      return inserted[0]?.id ?? null
    } catch {
      /* logging must never break the call */
      return null
    }
  }

  async choice<T extends string>(input: ChoiceInput<T> & {
    optionDescriptions?: Partial<Record<T, string>>
  }): Promise<ChoiceResult<T>> {
    const criteria: Record<string, string> = {}
    for (const opt of input.options) {
      criteria[opt] = input.optionDescriptions?.[opt] ?? `Category: ${opt}`
    }
    const questions = {
      answer: {
        type: 'choice',
        instructions:
          'Which option best fits?' +
          (input.context ? ' Context: ' + input.context : ''),
        criteria,
      },
    }
    const start = Date.now()
    try {
      const raw = await this.callPlayground(input.text, questions)
      const answer = extractAnswer(raw)
      // Laya's "typed choice" response puts the picked option in `choice`.
      // Accept `pick` as legacy alias.
      const picked = answer?.choice ?? answer?.pick
      if (!answer || typeof picked !== 'string') {
        throw new LayaUnavailableError(
          'unexpected response shape: ' + safeStringify(raw).slice(0, 200),
        )
      }
      const pick = picked as T
      if (!(input.options as readonly string[]).includes(pick)) {
        throw new LayaUnavailableError(`pick "${pick}" not in options`)
      }
      // Prefer the probability of the picked option (Laya's
      // `answer_confidence`, else the `probabilities` map), otherwise fall
      // back to `confidence`.
      const topProb = answer.answer_confidence ?? answer.probabilities?.[picked]
      const confidence = numberOr(
        topProb ?? answer.confidence ?? answer.probability,
        0.5,
      )
      await this.logCall('decision_choice', 'ok', Date.now() - start)
      return { pick, confidence }
    } catch (e) {
      await this.logCall(
        'decision_choice',
        'error',
        Date.now() - start,
        e instanceof Error ? e.message : String(e),
      )
      throw e
    }
  }

  async yesNo(input: YesNoInput): Promise<YesNoResult> {
    const questions = {
      answer: {
        type: 'noul',
        instructions: input.question,
      },
    }
    const start = Date.now()
    try {
      const raw = await this.callPlayground(input.text, questions)
      const a = extractAnswer(raw)
      if (!a) throw new LayaUnavailableError('no answer in response')
      // For noul (yes/no) the Jev-compatible wire format puts the probability
      // the proposition is true in `noul`. Older/alternate shapes may use
      // `probability` or a probabilities.true map. `confidence` is NOT a
      // probability of "true", so it is deliberately not used as a fallback.
      const prob = numberOr(a.noul ?? a.probability ?? a.probabilities?.true, 0.5)
      await this.logCall('decision_yesno', 'ok', Date.now() - start)
      return { answer: prob >= 0.5, confidence: Math.abs(prob - 0.5) * 2 }
    } catch (e) {
      await this.logCall(
        'decision_yesno',
        'error',
        Date.now() - start,
        e instanceof Error ? e.message : String(e),
      )
      throw e
    }
  }

  async score(input: ScoreInput): Promise<ScoreResult> {
    const [min, max] = input.scale ?? [0, 5]
    const levels: string[] = []
    // Gradio 'score' expects a list of level descriptions. Keep it small so
    // Laya doesn't have to reason over 100 buckets by default.
    const steps = Math.max(1, Math.min(20, Math.round(max - min) + 1))
    for (let i = 0; i < steps; i++) {
      const v = min + ((max - min) * i) / Math.max(1, steps - 1)
      levels.push(`Level ${v}`)
    }
    const questions = {
      answer: {
        type: 'score',
        instructions: input.rubric,
        criteria: levels,
      },
    }
    const start = Date.now()
    try {
      const raw = await this.callPlayground(input.text, questions)
      const a = extractAnswer(raw)
      const score = numberOr(a?.value ?? a?.score, min)
      await this.logCall('decision_score', 'ok', Date.now() - start)
      return { score }
    } catch (e) {
      await this.logCall(
        'decision_score',
        'error',
        Date.now() - start,
        e instanceof Error ? e.message : String(e),
      )
      throw e
    }
  }

  private async callPlayground(stateText: string, questions: unknown): Promise<LayaRaw> {
    const url = `${this.endpoint}/gradio_api/call/${FUNCTION_NAME}`
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`

    // Step 1: POST the call → { event_id }
    let postRes: Response
    try {
      postRes = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ data: [stateText, JSON.stringify(questions)] }),
        },
        { timeoutMs: LAYA_TIMEOUT_MS, label: 'laya POST' },
      )
    } catch (e) {
      throw new LayaUnavailableError(`laya network error: ${getMessage(e)}`)
    }
    if (!postRes.ok) {
      const body = await safeText(postRes)
      throw new LayaUnavailableError(`laya POST ${postRes.status}: ${body.slice(0, 200)}`)
    }
    let eventId: string | undefined
    try {
      const json = (await postRes.json()) as { event_id?: string }
      eventId = json.event_id
    } catch (e) {
      throw new LayaUnavailableError(`laya POST bad JSON: ${getMessage(e)}`)
    }
    if (!eventId) throw new LayaUnavailableError('laya POST missing event_id')

    // Step 2: GET SSE stream and parse the final data frame.
    let getRes: Response
    try {
      getRes = await fetchWithTimeout(
        `${url}/${eventId}`,
        { headers },
        { timeoutMs: LAYA_TIMEOUT_MS, label: 'laya GET' },
      )
    } catch (e) {
      throw new LayaUnavailableError(`laya GET network error: ${getMessage(e)}`)
    }
    if (!getRes.ok) {
      const body = await safeText(getRes)
      throw new LayaUnavailableError(`laya GET ${getRes.status}: ${body.slice(0, 200)}`)
    }
    const text = await safeText(getRes)

    // Gradio SSE frames look like:
    //   event: <name>
    //   data: <json>
    //
    // The final `complete` (or last non-empty) `data:` line carries the tuple
    // [rows_dataframe, raw_json_string]. Parse the last `data:` line to be
    // resilient across Gradio patch versions that emit different event names.
    const dataLines = text
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.startsWith('data:'))
    if (dataLines.length === 0) {
      throw new LayaUnavailableError('laya SSE: no data frames')
    }
    const lastData = dataLines[dataLines.length - 1]!
    let payload: unknown
    try {
      payload = JSON.parse(lastData.slice('data:'.length).trim())
    } catch (e) {
      throw new LayaUnavailableError(`laya SSE bad JSON: ${getMessage(e)}`)
    }

    // Payload is typically [rows_dataframe, raw_json_string]. We want the raw
    // JSON parsed. Accept an already-parsed object as a fallback for future
    // Gradio versions.
    const rawSlot: unknown = Array.isArray(payload) ? payload[1] : payload
    if (rawSlot == null) {
      throw new LayaUnavailableError('laya SSE: raw_json slot empty')
    }
    if (typeof rawSlot !== 'string') {
      return rawSlot as LayaRaw
    }
    try {
      return JSON.parse(rawSlot) as LayaRaw
    } catch (e) {
      throw new LayaUnavailableError(
        `laya SSE raw_json not parseable: ${getMessage(e)} — ${rawSlot.slice(0, 200)}`,
      )
    }
  }
}

/**
 * Extract the first answer from Laya's response, tolerant of two shapes:
 *   { answers: { answer: {...} } }   ← common
 *   { answer: {...} }                 ← flat
 *   [ {...} ]                          ← positional fallback
 */
function extractAnswer(raw: LayaRaw | undefined): LayaAnswer | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw[0]
  const bag = (raw as { answers?: Record<string, LayaAnswer> }).answers ?? (raw as Record<string, LayaAnswer>)
  if (!bag || typeof bag !== 'object') return undefined
  return bag.answer ?? Object.values(bag)[0]
}

function numberOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function getMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
