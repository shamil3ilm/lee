import { z } from 'zod'

// ---------------------------------------------------------------------------
// Master CV (spec §3.2) — the source of truth per user, stored as a
// `documents` row with kind='master_cv' and applicationId=null.
// ---------------------------------------------------------------------------

export const cvBasicsSchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  website: z.string().optional(),
})

export const cvExperienceSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().optional(),
  start: z.string().min(1), // ISO YYYY-MM
  end: z.union([z.string(), z.literal('present')]),
  bullets: z.array(z.string()).default([]),
  tech: z.array(z.string()).optional(),
})

export const cvProjectSchema = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  description: z.string().default(''),
  tech: z.array(z.string()).optional(),
  highlights: z.array(z.string()).optional(),
})

export const cvEducationSchema = z.object({
  school: z.string().min(1),
  degree: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  location: z.string().optional(),
  honors: z.string().optional(),
})

export const cvSkillsSchema = z.object({
  primary: z.array(z.string()).default([]),
  secondary: z.array(z.string()).optional(),
})

export const cvCertificationSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  date: z.string().optional(),
  url: z.string().optional(),
})

export const cvLanguageSchema = z.object({
  name: z.string().min(1),
  proficiency: z.string().min(1),
})

export const masterCvSchema = z.object({
  basics: cvBasicsSchema,
  summary: z.string().default(''),
  experience: z.array(cvExperienceSchema).default([]),
  projects: z.array(cvProjectSchema).optional(),
  education: z.array(cvEducationSchema).optional(),
  skills: cvSkillsSchema,
  certifications: z.array(cvCertificationSchema).optional(),
  languages: z.array(cvLanguageSchema).optional(),
})

export type MasterCV = z.infer<typeof masterCvSchema>

// ---------------------------------------------------------------------------
// Tailored CV (spec §3.3)
// ---------------------------------------------------------------------------

export const tailoringMetaSchema = z.object({
  applicationId: z.string(),
  reasoning: z.string().default(''),
  highlighted_skills: z.array(z.string()).default([]),
  reordered_experience_indices: z.array(z.number().int()).default([]),
  summary_rewrite: z.boolean().default(false),
})

export const tailoredCvSchema = masterCvSchema.extend({
  _tailoring: tailoringMetaSchema,
})

export type TailoredCV = z.infer<typeof tailoredCvSchema>

// ---------------------------------------------------------------------------
// Cover letter (spec §3.4)
// ---------------------------------------------------------------------------

export const coverLetterSchema = z.object({
  applicationId: z.string(),
  greeting: z.string().min(1),
  paragraphs: z.array(z.string()).min(1),
  closing: z.string().min(1),
  senderName: z.string().min(1),
})

export type CoverLetter = z.infer<typeof coverLetterSchema>

// ---------------------------------------------------------------------------
// GitHub sync shapes
// ---------------------------------------------------------------------------

export const githubRepoSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  primaryLanguage: z.string().nullable(),
  stargazers: z.number().int().nonnegative(),
  updatedAt: z.string(),
})

export type GitHubRepo = z.infer<typeof githubRepoSchema>

// Distilled projects from GitHub → subset of MasterCV['projects']
export const cvProjectsArraySchema = z.array(cvProjectSchema)
export type CvProjects = z.infer<typeof cvProjectsArraySchema>
