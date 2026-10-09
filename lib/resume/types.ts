import { z } from 'zod'

/**
 * The master profile: lee's ONE source of résumé facts (Settings › Profile ›
 * Résumé). Stored as `user_profile.resume` (jsonb), validated here.
 *
 * - Every item and highlight has a stable id (`lib/resume/ids.ts`), so
 *   variants and the portfolio extension can reference them.
 * - Every field carries a public/private flag in the object's `visibility`
 *   map (missing keys fall back to `lib/resume/visibility.ts`). Only public
 *   fields ever leave lee through Publish.
 * - The legacy MasterCV (`documents` kind `master_cv`) is DERIVED from this
 *   profile on every save (lib/resume/master-cv.ts) — never edited directly.
 */

export const VISIBILITIES = ['public', 'private'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
export const idSchema = z.string().regex(ID_PATTERN)

const text = (max: number) => z.string().trim().max(max)
const visibilityMap = z.record(z.string(), z.enum(VISIBILITIES)).default({})

/** JSON Resume date: YYYY, YYYY-MM or YYYY-MM-DD (empty = not set / present). */
export const DATE_PATTERN = /^([1-2][0-9]{3}-[0-1][0-9]-[0-3][0-9]|[1-2][0-9]{3}-[0-1][0-9]|[1-2][0-9]{3})$/
const dateField = z.union([z.literal(''), z.string().regex(DATE_PATTERN)]).default('')

/**
 * How well the user knows an item — PRIVATE: never published or rendered.
 * It only steers variant / tailoring selection and the study list; the
 * portfolio publishes whatever is marked public, whatever its depth.
 *   own          built it and can explain it
 *   ai_assisted  largely AI-generated; studying it
 *   learning     still learning it
 * Two readiness flags, both defaulting to true for `own` and false
 * otherwise (nothing else is ready until the user says so):
 *   interviewReady  can explain the IMPLEMENTATION (fully ready)
 *   domainReady     owns the idea / domain design, even if the code was
 *                   AI-assisted; such an item may only be phrased as
 *                   design or domain work (lib/resume/readiness.ts)
 * `interviewReady` implies `domainReady`. The study fields back
 * Settings › Study list.
 */
export const DEPTHS = ['own', 'ai_assisted', 'learning'] as const
export type Depth = (typeof DEPTHS)[number]

const readinessShape = {
  depth: z.enum(DEPTHS).default('own'),
  interviewReady: z.boolean(),
  domainReady: z.boolean(),
  /** What the user owns ("the domain model and ZATCA rules, not the code"). */
  ownedAspects: text(300).default(''),
  studyNotes: text(1000).default(''),
  studyTarget: dateField,
}

/**
 * Where an item came from when an importer added it (absent = typed in
 * lee or pulled from the portfolio). `importedAt` is the import batch's
 * ISO timestamp: together with `source` it identifies one batch, so
 * "Undo last import" and Reset can remove exactly what an import added.
 */
export const IMPORT_SOURCES = ['url', 'linkedin', 'cv', 'github'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]
const provenanceShape = {
  source: z.enum(IMPORT_SOURCES).optional(),
  importedAt: z.string().max(40).optional(),
}

/** Fill the readiness flags from `depth` when never set; ready implies domain-ready. */
function withReadyDefault(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const v = value as Record<string, unknown>
  const own = (typeof v.depth === 'string' ? v.depth : 'own') === 'own'
  const interviewReady = typeof v.interviewReady === 'boolean' ? v.interviewReady : own
  const domainReady = (typeof v.domainReady === 'boolean' ? v.domainReady : own) || interviewReady
  return { ...v, interviewReady, domainReady }
}

/** A fact-locked rewording of a master highlight (lib/resume/fact-lock.ts). */
export const wordingSchema = z.object({
  id: idSchema,
  text: text(2000).min(1),
  /** Who wrote it; AI wordings are only stored after the user confirms them. */
  source: z.enum(['user', 'ai']).default('user'),
})
export type Wording = z.infer<typeof wordingSchema>

export const highlightSchema = z.preprocess(
  withReadyDefault,
  z.object({
    id: idSchema,
    text: text(2000).min(1),
    alternates: z.array(wordingSchema).max(8).default([]),
    visibility: visibilityMap,
    ...readinessShape,
  }),
)
export type Highlight = z.infer<typeof highlightSchema>

export const profileLinkItemSchema = z.object({
  id: idSchema,
  network: text(200).min(1),
  username: text(100).default(''),
  url: text(500).min(1),
  visibility: visibilityMap,
})
export type ProfileNetwork = z.infer<typeof profileLinkItemSchema>

export const locationSchema = z.object({
  address: text(200).default(''),
  postalCode: text(20).default(''),
  city: text(100).default(''),
  region: text(100).default(''),
  countryCode: z.union([z.literal(''), z.string().regex(/^[A-Z]{2}$/)]).default(''),
})

export const basicsSchema = z.object({
  name: text(200).default(''),
  label: text(200).default(''),
  email: text(254).default(''),
  phone: text(40).default(''),
  url: text(500).default(''),
  summary: text(2000).default(''),
  image: text(500).default(''),
  location: locationSchema.default({ address: '', postalCode: '', city: '', region: '', countryCode: '' }),
  profiles: z.array(profileLinkItemSchema).max(12).default([]),
  // Region fields (GCC / India résumés); never part of JSON Resume.
  nationality: text(100).default(''),
  visaStatus: text(200).default(''),
  noticePeriod: text(100).default(''),
  dateOfBirth: dateField,
  maritalStatus: text(40).default(''),
  expectedSalary: text(100).default(''),
  visibility: visibilityMap,
})
export type Basics = z.infer<typeof basicsSchema>

export const workSchema = z.object({
  id: idSchema,
  name: text(200).min(1),
  position: text(200).min(1),
  location: text(200).default(''),
  url: text(500).default(''),
  description: text(500).default(''),
  // Empty only for legacy imports with an unreadable date; Publish names it.
  startDate: dateField,
  endDate: dateField,
  summary: text(2000).default(''),
  highlights: z.array(highlightSchema).max(30).default([]),
  keywords: z.array(text(200).min(1)).max(40).default([]),
  visibility: visibilityMap,
  ...provenanceShape,
})
export type WorkItem = z.infer<typeof workSchema>

export const projectSchema = z.preprocess(
  withReadyDefault,
  z.object({
    id: idSchema,
    name: text(200).min(1),
    description: text(200).default(''),
    url: text(500).default(''),
    startDate: dateField,
    endDate: dateField,
    keywords: z.array(text(200).min(1)).max(40).default([]),
    highlights: z.array(highlightSchema).max(30).default([]),
    visibility: visibilityMap,
    ...provenanceShape,
    ...readinessShape,
  }),
)
export type ProjectItem = z.infer<typeof projectSchema>

export const SKILL_KINDS = ['tech', 'domain'] as const
export type SkillKind = (typeof SKILL_KINDS)[number]

/**
 * One skill inside a group; carries its own readiness. `domain` skills
 * ("ZATCA requirements", "e-invoicing compliance") can be marked ready on
 * their own and may be backed by domain-only evidence; `tech` skills only
 * by fully ready items.
 */
export const skillSchema = z.preprocess(
  withReadyDefault,
  z.object({
    id: idSchema,
    name: text(200).min(1),
    kind: z.enum(SKILL_KINDS).default('tech'),
    ...provenanceShape,
    ...readinessShape,
  }),
)
export type Skill = z.infer<typeof skillSchema>

export const skillGroupSchema = z.object({
  id: idSchema,
  name: text(200).min(1),
  level: text(100).default(''),
  skills: z.array(skillSchema).max(60).default([]),
  visibility: visibilityMap,
})
export type SkillGroup = z.infer<typeof skillGroupSchema>

export const educationSchema = z.object({
  id: idSchema,
  institution: text(200).min(1),
  area: text(200).default(''),
  studyType: text(200).default(''),
  url: text(500).default(''),
  startDate: dateField,
  endDate: dateField,
  score: text(100).default(''),
  visibility: visibilityMap,
  ...provenanceShape,
})
export type EducationItem = z.infer<typeof educationSchema>

export const LANGUAGE_FLUENCIES = ['basic', 'conversational', 'professional', 'fluent', 'native'] as const
export type LanguageFluency = (typeof LANGUAGE_FLUENCIES)[number]

export const languageItemSchema = z.object({
  id: idSchema,
  language: text(60).min(1),
  fluency: z.enum(LANGUAGE_FLUENCIES).default('professional'),
  visibility: visibilityMap,
  ...provenanceShape,
})
export type LanguageItem = z.infer<typeof languageItemSchema>

export const certificateSchema = z.object({
  id: idSchema,
  name: text(200).min(1),
  issuer: text(200).default(''),
  date: dateField,
  url: text(500).default(''),
  visibility: visibilityMap,
  ...provenanceShape,
})
export type CertificateItem = z.infer<typeof certificateSchema>

/** meta.x-portfolio inputs lee owns (references by id; mapped to names/indexes on export). */
export const caseStudySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
  title: text(200).min(1),
  url: text(500).min(1),
  workId: idSchema,
  highlightId: idSchema,
})
export type CaseStudy = z.infer<typeof caseStudySchema>

export const quickViewResultSchema = z.object({
  id: idSchema,
  lead: text(200).min(1),
  text: text(2000).min(1),
  link: z
    .object({ label: text(200).min(1), href: text(500).min(1), closesDialog: z.boolean().optional() })
    .nullable()
    .default(null),
})
export type QuickViewResult = z.infer<typeof quickViewResultSchema>

export const portfolioSettingsSchema = z.object({
  displayName: text(200).default(''),
  canonical: text(500).default(''),
  caseStudies: z.array(caseStudySchema).max(20).default([]),
  quickView: z
    .object({
      role: text(200).default(''),
      line: text(2000).default(''),
      results: z.array(quickViewResultSchema).max(6).default([]),
      skills: z.array(text(200).min(1)).max(20).default([]),
    })
    .default({ role: '', line: '', results: [], skills: [] }),
  /**
   * JSON Resume top-level sections lee does not model (e.g. `volunteer`),
   * kept when the user takes them from the repo so a publish never drops
   * them. Already public: they came from the public file.
   */
  extra: z.record(z.string(), z.unknown()).default({}),
})
export type PortfolioSettings = z.infer<typeof portfolioSettingsSchema>

export const RESUME_SCHEMA_VERSION = 1

export const resumeProfileSchema = z.object({
  schemaVersion: z.literal(RESUME_SCHEMA_VERSION).default(RESUME_SCHEMA_VERSION),
  basics: basicsSchema.default(basicsSchema.parse({})),
  work: z.array(workSchema).max(40).default([]),
  projects: z.array(projectSchema).max(40).default([]),
  skills: z.array(skillGroupSchema).max(30).default([]),
  education: z.array(educationSchema).max(20).default([]),
  languages: z.array(languageItemSchema).max(20).default([]),
  certificates: z.array(certificateSchema).max(40).default([]),
  portfolio: portfolioSettingsSchema.default(portfolioSettingsSchema.parse({})),
})
export type ResumeProfile = z.infer<typeof resumeProfileSchema>
export type ResumeProfileInput = z.input<typeof resumeProfileSchema>

/** Sections whose items are lists with ids (the editor and variants use these names). */
export const ITEM_SECTIONS = ['work', 'projects', 'skills', 'education', 'languages', 'certificates'] as const
export type ItemSection = (typeof ITEM_SECTIONS)[number]

export function emptyResumeProfile(): ResumeProfile {
  return resumeProfileSchema.parse({})
}

/** Strict parse (throws) for writes. */
export function parseResumeProfile(value: unknown): ResumeProfile {
  return resumeProfileSchema.parse(value)
}

/** Lenient read: null when the stored value is missing or broken. */
export function readResumeProfile(value: unknown): ResumeProfile | null {
  if (value === null || value === undefined) return null
  const parsed = resumeProfileSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
