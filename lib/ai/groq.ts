import { buildParseJobPrompt } from './prompts/parse-job'
import { buildParseProfilePrompt } from './prompts/parse-profile'
import { buildScoreJobPrompt } from './prompts/score-job'
import { buildScoreCompanyPrompt } from './prompts/score-company'
import { buildTailorCVPrompt } from './prompts/tailor-cv'
import { buildCoverLetterPrompt } from './prompts/cover-letter'
import { buildDistillGithubPrompt } from './prompts/distill-github'
import { buildOutreachLinkedInConnectionPrompt } from './prompts/outreach-linkedin-connection'
import { buildOutreachLinkedInMessagePrompt } from './prompts/outreach-linkedin-message'
import { buildOutreachRecruiterReplyPrompt } from './prompts/outreach-recruiter-reply'
import { buildInterviewPrepPrompt } from './prompts/interview-prep'
import { buildGenerateLatexCVPrompt } from './prompts/generate-latex-cv'
import {
  companyMatchResultSchema,
  jobMatchResultSchema,
  latexCVResultSchema,
  parsedJobSchema,
  parsedProfileSchema,
  type AIProvider,
  type CompanyMatchResult,
  type JobMatchResult,
  type ParsedJob,
  type ParsedProfile,
} from './types'
import { stripLatexFencing } from './utils/latex'
import {
  coverLetterSchema,
  cvProjectsArraySchema,
  interviewPrepPackSchema,
  outreachDraftSchema,
  tailoredCvSchema,
  type CoverLetter,
  type CvProjects,
  type GitHubRepo,
  type InterviewPrepPack,
  type MasterCV,
  type OutreachDraft,
  type OutreachKind,
  type OutreachTone,
  type TailoredCV,
} from '@/lib/documents/types'
import type { NormalizedCompany, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

// Groq hosts open-source Llama models with OpenAI-compatible API and JSON
// response mode. Free tier is 30 req/min on Llama 3.3 70B — plenty for a
// personal job tracker. No SDK needed; the REST API is straightforward.
export class GroqProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    // Env-overridable so we can swap models without a code change.
    // openai/gpt-oss-20b is on Groq's Developer (free) tier — 1000 tok/sec,
    // 250K TPM, 1K RPM, 131K context. Excellent for structured JSON parsing.
    // Bump to openai/gpt-oss-120b via GROQ_MODEL for higher quality (still
    // free tier, ~500 tok/sec). Meta Llama models are gated to Enterprise.
    private readonly model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
  ) {}

  private async generateOnce(prompt: string): Promise<{
    text: string
    promptTokens: number
    completionTokens: number
  }> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`groq ${res.status}: ${body.slice(0, 400)}`)
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = json.choices[0]?.message?.content
    if (!content) throw new Error('groq: empty response content')
    return {
      text: content,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    }
  }

  private async generate(prompt: string): Promise<string> {
    const start = Date.now()
    const backoffs = [0, 1_000, 3_000]
    let lastError: unknown
    for (const wait of backoffs) {
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      try {
        const { text, promptTokens, completionTokens } = await this.generateOnce(prompt)
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
        // Retry only on transient errors.
        if (!/\b(503|500|429|Service Unavailable|overloaded|rate)\b/i.test(msg)) {
          break
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
        provider: 'groq',
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

  async tailorCV(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<TailoredCV> {
    const raw = await this.generate(buildTailorCVPrompt(input))
    return tailoredCvSchema.parse(JSON.parse(raw))
  }

  async draftCoverLetter(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<CoverLetter> {
    const raw = await this.generate(buildCoverLetterPrompt(input))
    return coverLetterSchema.parse(JSON.parse(raw))
  }

  async distillGithubProjects(input: { repos: GitHubRepo[] }): Promise<CvProjects> {
    const raw = await this.generate(buildDistillGithubPrompt(input))
    // JSON mode often forces an object wrapper even when the prompt asks for
    // an array. Accept either shape.
    const parsed = JSON.parse(raw)
    const array = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.projects)
        ? parsed.projects
        : Array.isArray(parsed?.items)
          ? parsed.items
          : []
    return cvProjectsArraySchema.parse(array)
  }

  async draftOutreach(input: {
    master: MasterCV
    application: ApplicationWithJob
    kind: OutreachKind
    tone: OutreachTone
  }): Promise<OutreachDraft> {
    const prompt = buildOutreachPromptGroq(input)
    const raw = await this.generate(prompt)
    return outreachDraftSchema.parse(JSON.parse(raw))
  }

  async generateInterviewPrepPack(input: {
    master: MasterCV
    application: ApplicationWithJob
    stageKind: string
    stageId?: string
  }): Promise<InterviewPrepPack> {
    const raw = await this.generate(buildInterviewPrepPrompt(input))
    return interviewPrepPackSchema.parse(JSON.parse(raw))
  }

  async generateLatexCV(input: {
    master: MasterCV
    templateId: string
  }): Promise<{ source: string }> {
    const raw = await this.generate(buildGenerateLatexCVPrompt(input))
    let source: string
    try {
      const parsed = latexCVResultSchema.parse(JSON.parse(raw))
      source = parsed.source
    } catch {
      source = raw
    }
    const cleaned = stripLatexFencing(source)
    if (!cleaned.trimStart().startsWith('\\documentclass')) {
      throw new Error('generateLatexCV: response does not start with \\documentclass')
    }
    return { source: cleaned }
  }
}

function buildOutreachPromptGroq(input: {
  master: MasterCV
  application: ApplicationWithJob
  kind: OutreachKind
  tone: OutreachTone
}): string {
  switch (input.kind) {
    case 'linkedin_connection':
      return buildOutreachLinkedInConnectionPrompt(input)
    case 'linkedin_message':
      return buildOutreachLinkedInMessagePrompt(input)
    case 'recruiter_reply':
      return buildOutreachRecruiterReplyPrompt(input)
  }
}
