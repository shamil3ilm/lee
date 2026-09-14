import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildParseJobPrompt } from './prompts/parse-job'
import { buildParseProfilePrompt } from './prompts/parse-profile'
import { parsedJobSchema, parsedProfileSchema, type AIProvider, type ParsedJob, type ParsedProfile } from './types'

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI
  constructor(apiKey: string, private readonly model = 'gemini-2.5-flash') {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  private async generate(prompt: string): Promise<string> {
    const start = Date.now()
    let promptTokens = 0
    let completionTokens = 0
    try {
      const m = this.client.getGenerativeModel({
        model: this.model,
        generationConfig: { responseMimeType: 'application/json' },
      })
      const res = await m.generateContent(prompt)
      const text = res.response.text()
      promptTokens = res.response.usageMetadata?.promptTokenCount ?? 0
      completionTokens = res.response.usageMetadata?.candidatesTokenCount ?? 0
      await this.logCall({ status: 'ok', latency: Date.now() - start, promptTokens, completionTokens })
      return text
    } catch (e) {
      await this.logCall({ status: 'error', latency: Date.now() - start, error: (e as Error).message })
      throw e
    }
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
}
