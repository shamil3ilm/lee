import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildParseJobPrompt } from './prompts/parse-job'
import { buildParseProfilePrompt } from './prompts/parse-profile'
import { buildScoreJobPrompt } from './prompts/score-job'
import { buildScoreCompanyPrompt } from './prompts/score-company'
import {
  companyMatchResultSchema,
  jobMatchResultSchema,
  parsedJobSchema,
  parsedProfileSchema,
  type AIProvider,
  type CompanyMatchResult,
  type JobMatchResult,
  type ParsedJob,
  type ParsedProfile,
} from './types'
import type { NormalizedCompany, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI
  // gemini-2.5-flash was retired for new users; 3.6-flash is the current
  // free-tier default. Env override supported for future migration.
  constructor(
    apiKey: string,
    private readonly model = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
  ) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  private async generateOnce(modelName: string, prompt: string): Promise<{
    text: string
    promptTokens: number
    completionTokens: number
  }> {
    const m = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    })
    const res = await m.generateContent(prompt)
    return {
      text: res.response.text(),
      promptTokens: res.response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: res.response.usageMetadata?.candidatesTokenCount ?? 0,
    }
  }

  private async generate(prompt: string): Promise<string> {
    const start = Date.now()
    // Fallback chain: primary → flash-lite (usually less loaded) → last resort
    // is bubbling the error so the caller can toast it.
    const models = [this.model, 'gemini-3.6-flash-lite'].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    )
    const backoffs = [0, 1_000, 3_000] // three attempts, exponential-ish

    let lastError: unknown
    for (const modelName of models) {
      for (const wait of backoffs) {
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        try {
          const { text, promptTokens, completionTokens } = await this.generateOnce(
            modelName,
            prompt,
          )
          await this.logCall({
            status: 'ok',
            latency: Date.now() - start,
            promptTokens,
            completionTokens,
          })
          return text
        } catch (e) {
          lastError = e
          const msg = (e as Error).message ?? ''
          // Only retry on transient errors: 503 overload, 429 rate limit, 500.
          // Fatal errors (404 model not found, 400 bad request) bail immediately.
          if (!/\b(503|500|429|Service Unavailable|overloaded|rate)\b/i.test(msg)) {
            break // break inner backoff loop → try next model
          }
        }
      }
    }
    await this.logCall({
      status: 'error',
      latency: Date.now() - start,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    })
    throw lastError
  }

  private async logCall(x: {
    status: string
    latency: number
    promptTokens?: number
    completionTokens?: number
    error?: string
  }): Promise<void> {
    try {
      const { db } = await import('@/lib/db/client')
      const { aiCallLogs } = await import('@/lib/db/schema')
      await db.insert(aiCallLogs).values({
        provider: 'gemini',
        kind: 'parse',
        promptTokens: x.promptTokens ?? null,
        completionTokens: x.completionTokens ?? null,
        latencyMs: x.latency,
        status: x.status,
        error: x.error ?? null,
      })
    } catch {
      /* logging must never break the call */
    }
  }

  async parseJob(text: string): Promise<ParsedJob> {
    const raw = await this.generate(buildParseJobPrompt(text))
    return parsedJobSchema.parse(JSON.parse(raw))
  }

  async parseProfile(input: { cvText?: string; profileMd?: string }): Promise<ParsedProfile> {
    const raw = await this.generate(buildParseProfilePrompt(input))
    return parsedProfileSchema.parse(JSON.parse(raw))
  }

  async scoreJob(job: NormalizedJob, profile: UserProfile): Promise<JobMatchResult> {
    const raw = await this.generate(buildScoreJobPrompt(job, profile))
    return jobMatchResultSchema.parse(JSON.parse(raw))
  }

  async scoreCompany(company: NormalizedCompany, profile: UserProfile): Promise<CompanyMatchResult> {
    const raw = await this.generate(buildScoreCompanyPrompt(company, profile))
    return companyMatchResultSchema.parse(JSON.parse(raw))
  }
}
