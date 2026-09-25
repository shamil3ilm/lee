import { z } from 'zod'
import type { NormalizedCompany, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type {
  CoverLetter,
  CvProjects,
  GitHubRepo,
  InterviewDebrief,
  InterviewPrepPack,
  MasterCV,
  OutreachDraft,
  OutreachKind,
  OutreachTone,
  TailoredCV,
} from '@/lib/documents/types'
import type { InterviewStage } from '@/lib/db/queries/stages'
import type { CallMeta } from './log'

export const parsedJobSchema = z.object({
  title: z.string(),
  company_name: z.string(),
  company_domain: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  remote_type: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
  employment_type: z.enum(['fulltime', 'contract', 'parttime', 'internship', 'unknown']).default('unknown'),
  salary_min: z.number().int().nullable().optional(),
  salary_max: z.number().int().nullable().optional(),
  salary_currency: z.string().nullable().optional(),
  seniority: z.enum(['junior', 'mid', 'senior', 'staff', 'principal', 'manager', 'director', 'unknown']).default('unknown'),
  tech_stack: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  benefits: z.record(z.string(), z.any()).default({}),
})

export type ParsedJob = z.infer<typeof parsedJobSchema>

export const parsedProfileSchema = z.object({
  headline: z.string().nullable().optional(),
  summary_md: z.string().nullable().optional(),
  skills: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  role_types: z.array(z.string()).default([]),
  seniority: z.string().nullable().optional(),
  years_experience: z.number().int().nullable().optional(),
  stack_weights: z.record(z.string(), z.number()).default({}),
})

export type ParsedProfile = z.infer<typeof parsedProfileSchema>

// ---------------------------------------------------------------------------
// Scoring (v1.5 discovery)
// ---------------------------------------------------------------------------

export const jobMatchResultSchema = z.object({
  match_score: z.number().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  reasoning: z.string().default(''),
  location_match: z
    .enum(['priority_1', 'priority_2', 'priority_3', 'remote', 'mismatch'])
    .default('mismatch'),
  seniority_match: z
    .enum(['match', 'stretch_up', 'stretch_down', 'mismatch'])
    .default('mismatch'),
  stack_overlap: z.array(z.string()).default([]),
  stack_gaps: z.array(z.string()).default([]),
  industry_match: z.enum(['strong', 'adjacent', 'weak', 'mismatch']).default('weak'),
})

export type JobMatchResult = z.infer<typeof jobMatchResultSchema>

export const companyMatchResultSchema = z.object({
  match_score: z.number().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  reasoning: z.string().default(''),
  industry_match: z.enum(['strong', 'adjacent', 'weak', 'mismatch']).default('weak'),
  size_match: z.enum(['match', 'small', 'large']).default('match'),
})

export type CompanyMatchResult = z.infer<typeof companyMatchResultSchema>

// ---------------------------------------------------------------------------
// v12.0 — CV scoring (requirement fit + autofix bullet rewrites)
// ---------------------------------------------------------------------------

export const requirementFitItemSchema = z.object({
  requirement: z.string(),
  status: z.enum(['met', 'partial', 'missing']).catch('missing'),
  evidence: z.string().default(''),
  suggestion: z.string().default(''),
})
export const requirementFitResultSchema = z.object({
  items: z.array(requirementFitItemSchema).default([]),
})
export type RequirementFitItem = z.infer<typeof requirementFitItemSchema>
export type RequirementFitResult = z.infer<typeof requirementFitResultSchema>

export interface RequirementFitInput {
  cvText: string
  requirements: string[]
  jobTitle: string
}

export const bulletRewriteResultSchema = z.object({
  rewrites: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
})
export type BulletRewriteResult = z.infer<typeof bulletRewriteResultSchema>

export interface BulletRewriteInput {
  bullets: { id: string; text: string; role?: string; company?: string }[]
}

export interface AIProvider {
  parseJob(text: string, meta?: CallMeta): Promise<ParsedJob>
  parseProfile(
    input: { cvText?: string; profileMd?: string },
    meta?: CallMeta,
  ): Promise<ParsedProfile>
  // v10.1 — `meta` lets the discovery service capture the ai_call_logs row
  // id via `onLogged`, so the score can be persisted onto the discovery row
  // for later implicit-signal writeback (dismiss/save).
  scoreJob(job: NormalizedJob, profile: UserProfile, meta?: CallMeta): Promise<JobMatchResult>
  scoreCompany(
    company: NormalizedCompany,
    profile: UserProfile,
    meta?: CallMeta,
  ): Promise<CompanyMatchResult>
  // v2 additions — CV & document generation.
  tailorCV(input: { master: MasterCV; application: ApplicationWithJob }): Promise<TailoredCV>
  draftCoverLetter(input: {
    master: MasterCV
    application: ApplicationWithJob
  }): Promise<CoverLetter>
  distillGithubProjects(input: { repos: GitHubRepo[] }): Promise<CvProjects>
  // v4 additions — outreach + interview prep.
  // v4.2 — `daysSince` is required only when kind='followup_email'; the
  // dispatch inside each provider routes to buildFollowupPrompt then.
  draftOutreach(input: {
    master: MasterCV
    application: ApplicationWithJob
    kind: OutreachKind
    tone: OutreachTone
    daysSince?: number
  }): Promise<OutreachDraft>
  generateInterviewPrepPack(input: {
    master: MasterCV
    application: ApplicationWithJob
    stageKind: string
    stageId?: string
  }): Promise<InterviewPrepPack>
  // v4.3 addition — post-interview debrief. `quickNotes` is the raw text the
  // user typed in the debrief modal; the AI turns it into a structured
  // InterviewDebrief JSON.
  generateInterviewDebrief(input: {
    master: MasterCV
    application: ApplicationWithJob
    stage: Pick<InterviewStage, 'id' | 'kind' | 'title' | 'scheduledAt'>
    quickNotes: string
  }): Promise<InterviewDebrief>
  // v5 addition — LaTeX CV generation for the Overleaf-like editor.
  generateLatexCV(input: {
    master: MasterCV
    templateId: string
  }): Promise<{ source: string }>
  // v12.0 additions — CV scoring. `assessRequirementFit` returns per-JD-
  // requirement status + a quote the caller VERIFIES against the CV text;
  // `rewriteCvBullets` powers the weak-opener autofix preview (the caller
  // rejects any rewrite that introduces new digits).
  assessRequirementFit(input: RequirementFitInput, meta?: CallMeta): Promise<RequirementFitResult>
  rewriteCvBullets(input: BulletRewriteInput, meta?: CallMeta): Promise<BulletRewriteResult>
}

export const latexCVResultSchema = z.object({ source: z.string().min(1) })
export type LatexCVResult = z.infer<typeof latexCVResultSchema>
