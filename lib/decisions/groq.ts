import { z } from 'zod'
import type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'
import { fetchWithTimeout, GROQ_ATTEMPT_TIMEOUT_MS } from '@/lib/net/timeout'
import { recordAiCall } from '@/lib/ai/log-call'
import { AiHttpError, attemptStatus, errorMessage, httpStatusOf } from '@/lib/ai/attempts'
import { parseGroqRateLimitHeaders } from '@/lib/ai/rate-limit-headers'
import { recordQuotaSnapshot } from '@/lib/ai/quota-snapshot'

const choiceResponseSchema = z.object({
  pick: z.string(),
  confidence: z.number().min(0).max(1),
})

const yesNoResponseSchema = z.object({
  answer: z.boolean(),
  confidence: z.number().min(0).max(1),
})

const scoreResponseSchema = z.object({
  score: z.number(),
})

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

type DecisionLogKind = 'decision_choice' | 'decision_yesno' | 'decision_score'

/**
 * Groq-backed decision provider. Uses the OpenAI-compatible Chat Completions
 * endpoint with `response_format: {type: 'json_object'}` for structured
 * output. Same free-tier API key as the AI provider — no additional cost
 * envelope, no additional latency budget.
 *
 * Errors bubble; the composed provider wrapper handles fallback.
 *
 * Every call writes one ai_call_logs row (tokens, model, HTTP status; never
 * the prompt) and refreshes the Groq rate-limit snapshot. The user comes
 * from the enclosing usage scope (lib/ai/usage).
 */
export class GroqDecisionProvider implements DecisionProvider {
  constructor(
    private readonly apiKey: string,
    // Model is env-overridable via GROQ_MODEL to mirror the AI provider path.
    private readonly model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
  ) {}

  private async chat(prompt: string, kind: DecisionLogKind): Promise<string> {
    const start = Date.now()
    try {
      const res = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
        },
        { timeoutMs: GROQ_ATTEMPT_TIMEOUT_MS, label: 'groq decision' },
      )
      const rateLimit = parseGroqRateLimitHeaders(res.headers)
      await recordQuotaSnapshot({ provider: 'groq', model: this.model, snapshot: rateLimit })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new AiHttpError(`groq decision ${res.status}: ${body.slice(0, 200)}`, res.status)
      }
      const json = (await res.json()) as GroqChatResponse
      const content = json.choices?.[0]?.message?.content
      if (!content) throw new Error('groq decision: empty response content')
      await recordAiCall('groq', {
        status: 'ok',
        latency: Date.now() - start,
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        meta: { kind },
        model: this.model,
        httpStatus: res.status,
      })
      return content
    } catch (e) {
      await recordAiCall('groq', {
        status: attemptStatus(e),
        latency: Date.now() - start,
        error: errorMessage(e),
        meta: { kind },
        model: this.model,
        httpStatus: httpStatusOf(e),
      })
      throw e
    }
  }

  async choice<T extends string>(input: ChoiceInput<T>): Promise<ChoiceResult<T>> {
    const options = (input.options as readonly string[]).join(', ')
    const context = input.context ? `Context: ${input.context}\n` : ''
    const prompt = [
      'Pick exactly one value from the allowed list that best classifies the input.',
      `Allowed values: [${options}]`,
      context,
      `Input: ${input.text}`,
      'Respond with JSON: {"pick": "<one of the allowed values>", "confidence": <0..1>}.',
      'If nothing fits, pick the closest match and use a low confidence.',
    ]
      .filter(Boolean)
      .join('\n')
    const raw = await this.chat(prompt, 'decision_choice')
    const parsed = choiceResponseSchema.parse(JSON.parse(raw))
    if (!(input.options as readonly string[]).includes(parsed.pick)) {
      throw new Error(`groq decision.choice: pick "${parsed.pick}" not in options`)
    }
    return { pick: parsed.pick as T, confidence: parsed.confidence }
  }

  async yesNo(input: YesNoInput): Promise<YesNoResult> {
    const context = input.context ? `Context: ${input.context}\n` : ''
    const prompt = [
      'Answer a yes/no question about the input.',
      `Question: ${input.question}`,
      context,
      `Input: ${input.text}`,
      'Respond with JSON: {"answer": true|false, "confidence": <0..1>}.',
    ]
      .filter(Boolean)
      .join('\n')
    const raw = await this.chat(prompt, 'decision_yesno')
    return yesNoResponseSchema.parse(JSON.parse(raw))
  }

  async score(input: ScoreInput): Promise<ScoreResult> {
    const [min, max] = input.scale ?? [0, 1]
    const context = input.context ? `Context: ${input.context}\n` : ''
    const prompt = [
      `Score the input on the scale [${min}, ${max}] according to the rubric.`,
      `Rubric: ${input.rubric}`,
      context,
      `Input: ${input.text}`,
      `Respond with JSON: {"score": <number between ${min} and ${max}>}.`,
    ]
      .filter(Boolean)
      .join('\n')
    const raw = await this.chat(prompt, 'decision_score')
    return scoreResponseSchema.parse(JSON.parse(raw))
  }
}
