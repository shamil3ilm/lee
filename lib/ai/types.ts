import { z } from 'zod'

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

export interface AIProvider {
  parseJob(text: string): Promise<ParsedJob>
  parseProfile(input: { cvText?: string; profileMd?: string }): Promise<ParsedProfile>
}
