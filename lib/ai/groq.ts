import { buildParseJobPrompt, PARSE_JOB_PROMPT_VERSION } from './prompts/parse-job'
import { buildParseProfilePrompt, PARSE_PROFILE_PROMPT_VERSION } from './prompts/parse-profile'
import { buildScoreJobPrompt, SCORE_JOB_PROMPT_VERSION } from './prompts/score-job'
import { buildScoreCompanyPrompt, SCORE_COMPANY_PROMPT_VERSION } from './prompts/score-company'
import { buildTailorCVPrompt, TAILOR_CV_PROMPT_VERSION } from './prompts/tailor-cv'
import { buildCoverLetterPrompt, COVER_LETTER_PROMPT_VERSION } from './prompts/cover-letter'
import { buildDistillGithubPrompt, DISTILL_GITHUB_PROMPT_VERSION } from './prompts/distill-github'
import {
  buildOutreachLinkedInConnectionPrompt,
  OUTREACH_LINKEDIN_CONNECTION_PROMPT_VERSION,
} from './prompts/outreach-linkedin-connection'
import {
  buildOutreachLinkedInMessagePrompt,
  OUTREACH_LINKEDIN_MESSAGE_PROMPT_VERSION,
} from './prompts/outreach-linkedin-message'
import {
  buildOutreachRecruiterReplyPrompt,
  OUTREACH_RECRUITER_REPLY_PROMPT_VERSION,
} from './prompts/outreach-recruiter-reply'
import { buildFollowupPrompt, OUTREACH_FOLLOWUP_PROMPT_VERSION } from './prompts/outreach-followup'
import { buildInterviewPrepPrompt, INTERVIEW_PREP_PROMPT_VERSION } from './prompts/interview-prep'
import {
  buildInterviewDebriefPrompt,
  INTERVIEW_DEBRIEF_PROMPT_VERSION,
} from './prompts/interview-debrief'
import {
  buildGenerateLatexCVPrompt,
  GENERATE_LATEX_CV_PROMPT_VERSION,
} from './prompts/generate-latex-cv'
import { hashPrompt } from './prompts/hash'
import {
  buildCvRequirementFitPrompt,
  CV_REQUIREMENT_FIT_PROMPT_VERSION,
} from './prompts/cv-requirement-fit'
import {
  buildCvBulletRewritePrompt,
  CV_BULLET_REWRITE_PROMPT_VERSION,
} from './prompts/cv-bullet-rewrite'
import {
  bulletRewriteResultSchema,
  requirementFitResultSchema,
  type BulletRewriteInput,
  type BulletRewriteResult,
  type RequirementFitInput,
  type RequirementFitResult,
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
import type { CallMeta } from './log'
import { fetchWithTimeout, GROQ_ATTEMPT_TIMEOUT_MS } from '@/lib/net/timeout'
import { stripLatexFencing } from './utils/latex'
import {
  coverLetterSchema,
  cvProjectsArraySchema,
  interviewDebriefSchema,
  interviewPrepPackSchema,
  outreachDraftSchema,
  tailoredCvSchema,
  type CoverLetter,
  type CvProjects,
  type GitHubRepo,
  type InterviewDebrief,
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
import type { InterviewStage } from '@/lib/db/queries/stages'

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
    // Fresh timeout per attempt. "timed out" is not in the retry regex in
    // generate(), so a hung upstream costs one attempt, not three.
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
          temperature: 0.2,
        }),
      },
      { timeoutMs: GROQ_ATTEMPT_TIMEOUT_MS, label: 'groq' },
    )
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

  private async generate(prompt: string, meta: CallMeta = {}): Promise<string> {
    const start = Date.now()
    const backoffs = [0, 1_000, 3_000]
    // v10.1 — compute prompt hash once per generate() so retries share the key.
    const metaWithHash: CallMeta = {
      ...meta,
      promptHash: meta.promptHash ?? hashPrompt(prompt),
    }
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
          meta: metaWithHash,
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
      meta: metaWithHash,
    })
    throw lastError
  }

  /**
   * v10.1 — inserts one ai_call_logs row (with prompt hash + version + doc
   * link if provided) and fires `onLogged(callId)` when the caller wants to
   * capture the inserted id for a foreign-key linkage.
   */
  private async logCall(x: {
    status: string
    latency: number
    promptTokens?: number
    completionTokens?: number
    error?: string
    meta?: CallMeta
  }): Promise<void> {
    try {
      const { db } = await import('@/lib/db/client')
      const { aiCallLogs } = await import('@/lib/db/schema')
      const inserted = await db
        .insert(aiCallLogs)
        .values({
          userId: x.meta?.userId ?? null,
          provider: 'groq',
          kind: x.meta?.kind ?? 'parse',
          promptTokens: x.promptTokens ?? null,
          completionTokens: x.completionTokens ?? null,
          latencyMs: x.latency,
          status: x.status,
          error: x.error ?? null,
          documentId: x.meta?.documentId ?? null,
          signalCheckPassed: x.meta?.signalCheckPassed ?? null,
          signalCheckCode: x.meta?.signalCheckCode ?? null,
          promptHash: x.meta?.promptHash ?? null,
          promptVersion: x.meta?.promptVersion ?? null,
        })
        .returning()
      const id = inserted[0]?.id
      if (id && x.meta?.onLogged) {
        try {
          x.meta.onLogged(id)
        } catch {
          /* callback must never break the call */
        }
      }
    } catch {
      /* logging must never break the call */
    }
  }

  async parseJob(text: string, meta: CallMeta = {}): Promise<ParsedJob> {
    const raw = await this.generate(buildParseJobPrompt(text), {
      ...meta,
      kind: 'parse_job',
      promptVersion: PARSE_JOB_PROMPT_VERSION,
    })
    return parsedJobSchema.parse(JSON.parse(raw))
  }

  async parseProfile(
    input: { cvText?: string; profileMd?: string },
    meta: CallMeta = {},
  ): Promise<ParsedProfile> {
    const raw = await this.generate(buildParseProfilePrompt(input), {
      ...meta,
      kind: 'parse_profile',
      promptVersion: PARSE_PROFILE_PROMPT_VERSION,
    })
    return parsedProfileSchema.parse(JSON.parse(raw))
  }

  async scoreJob(
    job: NormalizedJob,
    profile: UserProfile,
    meta: CallMeta = {},
  ): Promise<JobMatchResult> {
    const raw = await this.generate(buildScoreJobPrompt(job, profile), {
      ...meta,
      kind: 'score_job',
      promptVersion: SCORE_JOB_PROMPT_VERSION,
    })
    return jobMatchResultSchema.parse(JSON.parse(raw))
  }

  async scoreCompany(
    company: NormalizedCompany,
    profile: UserProfile,
    meta: CallMeta = {},
  ): Promise<CompanyMatchResult> {
    const raw = await this.generate(buildScoreCompanyPrompt(company, profile), {
      ...meta,
      kind: 'score_company',
      promptVersion: SCORE_COMPANY_PROMPT_VERSION,
    })
    return companyMatchResultSchema.parse(JSON.parse(raw))
  }

  async tailorCV(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<TailoredCV> {
    const raw = await this.generate(buildTailorCVPrompt(input), {
      kind: 'tailored_cv',
      promptVersion: TAILOR_CV_PROMPT_VERSION,
    })
    return tailoredCvSchema.parse(JSON.parse(raw))
  }

  async draftCoverLetter(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<CoverLetter> {
    const raw = await this.generate(buildCoverLetterPrompt(input), {
      kind: 'cover_letter',
      promptVersion: COVER_LETTER_PROMPT_VERSION,
    })
    return coverLetterSchema.parse(JSON.parse(raw))
  }

  async distillGithubProjects(input: { repos: GitHubRepo[] }): Promise<CvProjects> {
    const raw = await this.generate(buildDistillGithubPrompt(input), {
      kind: 'distill_github',
      promptVersion: DISTILL_GITHUB_PROMPT_VERSION,
    })
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
    daysSince?: number
  }): Promise<OutreachDraft> {
    const prompt = buildOutreachPromptGroq(input)
    const raw = await this.generate(prompt, {
      kind: `outreach_${input.kind}`,
      promptVersion: outreachPromptVersionGroq(input.kind),
    })
    return outreachDraftSchema.parse(JSON.parse(raw))
  }

  async generateInterviewPrepPack(input: {
    master: MasterCV
    application: ApplicationWithJob
    stageKind: string
    stageId?: string
  }): Promise<InterviewPrepPack> {
    const raw = await this.generate(buildInterviewPrepPrompt(input), {
      kind: 'interview_prep_pack',
      promptVersion: INTERVIEW_PREP_PROMPT_VERSION,
    })
    return interviewPrepPackSchema.parse(JSON.parse(raw))
  }

  async generateInterviewDebrief(input: {
    master: MasterCV
    application: ApplicationWithJob
    stage: Pick<InterviewStage, 'id' | 'kind' | 'title' | 'scheduledAt'>
    quickNotes: string
  }): Promise<InterviewDebrief> {
    const raw = await this.generate(buildInterviewDebriefPrompt(input), {
      kind: 'interview_debrief',
      promptVersion: INTERVIEW_DEBRIEF_PROMPT_VERSION,
    })
    return interviewDebriefSchema.parse(JSON.parse(raw))
  }

  async generateLatexCV(input: {
    master: MasterCV
    templateId: string
  }): Promise<{ source: string }> {
    const raw = await this.generate(buildGenerateLatexCVPrompt(input), {
      kind: 'latex_cv',
      promptVersion: GENERATE_LATEX_CV_PROMPT_VERSION,
    })
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

  async assessRequirementFit(
    input: RequirementFitInput,
    meta: CallMeta = {},
  ): Promise<RequirementFitResult> {
    const raw = await this.generate(buildCvRequirementFitPrompt(input), {
      ...meta,
      kind: 'cv_requirement_fit',
      promptVersion: CV_REQUIREMENT_FIT_PROMPT_VERSION,
    })
    return requirementFitResultSchema.parse(JSON.parse(raw))
  }

  async rewriteCvBullets(
    input: BulletRewriteInput,
    meta: CallMeta = {},
  ): Promise<BulletRewriteResult> {
    const raw = await this.generate(buildCvBulletRewritePrompt(input), {
      ...meta,
      kind: 'cv_bullet_rewrite',
      promptVersion: CV_BULLET_REWRITE_PROMPT_VERSION,
    })
    return bulletRewriteResultSchema.parse(JSON.parse(raw))
  }
}

function buildOutreachPromptGroq(input: {
  master: MasterCV
  application: ApplicationWithJob
  kind: OutreachKind
  tone: OutreachTone
  daysSince?: number
}): string {
  switch (input.kind) {
    case 'linkedin_connection':
      return buildOutreachLinkedInConnectionPrompt(input)
    case 'linkedin_message':
      return buildOutreachLinkedInMessagePrompt(input)
    case 'recruiter_reply':
      return buildOutreachRecruiterReplyPrompt(input)
    case 'followup_email':
      if (input.daysSince === undefined) {
        throw new Error('followup_email requires daysSince')
      }
      return buildFollowupPrompt({
        master: input.master,
        application: input.application,
        tone: input.tone,
        daysSince: input.daysSince,
      })
  }
}

/** v10.1 — map an OutreachKind to the prompt builder's VERSION constant. */
function outreachPromptVersionGroq(kind: OutreachKind): string {
  switch (kind) {
    case 'linkedin_connection':
      return OUTREACH_LINKEDIN_CONNECTION_PROMPT_VERSION
    case 'linkedin_message':
      return OUTREACH_LINKEDIN_MESSAGE_PROMPT_VERSION
    case 'recruiter_reply':
      return OUTREACH_RECRUITER_REPLY_PROMPT_VERSION
    case 'followup_email':
      return OUTREACH_FOLLOWUP_PROMPT_VERSION
  }
}
