import { z } from 'zod'
import type { NormalizedCompany, NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'

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

export interface AIProvider {
  parseJob(text: string): Promise<ParsedJob>
  parseProfile(input: { cvText?: string; profileMd?: string }): Promise<ParsedProfile>
  scoreJob(job: NormalizedJob, profile: UserProfile): Promise<JobMatchResult>
  scoreCompany(company: NormalizedCompany, profile: UserProfile): Promise<CompanyMatchResult>
}
