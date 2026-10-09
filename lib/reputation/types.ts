import { z } from 'zod'

/**
 * Company reputation (docs/company-reviews.md). Client-safe types and zod
 * schemas: signals fetched from free APIs, the user's own review-site
 * ratings, and the AI summary the user confirmed.
 */

/** Sources fetched automatically by the refresh job. */
export const AUTO_SOURCES = ['hn', 'gdelt', 'wikidata'] as const
export type AutoSource = (typeof AUTO_SOURCES)[number]

export const SOURCE_LABELS: Readonly<Record<AutoSource, string>> = {
  hn: 'Hacker News',
  gdelt: 'News (GDELT)',
  wikidata: 'Wikidata',
}

export const NEWS_CATEGORIES = [
  'layoffs',
  'lawsuit',
  'fraud',
  'wage_theft',
  'visa_contract',
  'funding',
  'acquisition',
  'expansion',
  'closure',
  'other',
] as const
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]

export const SIGNAL_KINDS = ['hn_mention', 'hn_hiring', 'news'] as const
export type SignalKind = (typeof SIGNAL_KINDS)[number]

export const signalSchema = z.object({
  /** Stable short id (hash of source + url), used for citations. */
  id: z.string().min(1).max(40),
  source: z.enum(AUTO_SOURCES),
  kind: z.enum(SIGNAL_KINDS),
  title: z.string().max(200),
  url: z.string().url(),
  /** ISO date (yyyy-mm-dd) the item was published or seen. */
  date: z.string().nullable(),
  category: z.enum(NEWS_CATEGORIES).nullable().default(null),
  /** Optional count (HN points, hiring-thread months). */
  value: z.number().nullable().default(null),
})
export type ReputationSignal = z.infer<typeof signalSchema>

export const sourceStatusSchema = z.object({
  ok: z.boolean(),
  /** ISO timestamp of the attempt. */
  at: z.string(),
  count: z.number().int().min(0),
  error: z.string().max(200).nullable(),
})
export type SourceStatus = z.infer<typeof sourceStatusSchema>
export type SourceStatusMap = Partial<Record<AutoSource, SourceStatus>>

export const factsSchema = z.object({
  wikidataId: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  founded: z.string().nullable(),
  headquarters: z.string().nullable(),
  industry: z.string().nullable(),
  employees: z.number().nullable(),
  website: z.string().nullable(),
  wikipediaUrl: z.string().nullable(),
})
export type CompanyFacts = z.infer<typeof factsSchema>

export const REVIEW_SITES = [
  'glassdoor',
  'indeed',
  'ambitionbox',
  'comparably',
  'kununu',
  'blind',
  'other',
] as const
export type ReviewSite = (typeof REVIEW_SITES)[number]

export const userRatingSchema = z.object({
  site: z.enum(REVIEW_SITES),
  /** 1–5 stars as shown on the site (one decimal). */
  rating: z.number().min(1).max(5),
  summary: z.string().trim().max(1000).default(''),
  url: z.string().url().nullable().default(null),
  recordedAt: z.string(),
})
export type UserRating = z.infer<typeof userRatingSchema>

export const RED_FLAG_CATEGORIES = [
  'unpaid_salaries',
  'visa_contract',
  'layoffs',
  'toxic_culture',
  'fraud',
  'other',
] as const
export type RedFlagCategory = (typeof RED_FLAG_CATEGORIES)[number]

export const RED_FLAG_LABELS: Readonly<Record<RedFlagCategory, string>> = {
  unpaid_salaries: 'Unpaid salaries / wage theft',
  visa_contract: 'Visa or contract issues',
  layoffs: 'Layoffs',
  toxic_culture: 'Toxic culture',
  fraud: 'Fraud',
  other: 'Other',
}

const citesSchema = z.array(z.string().min(1).max(40)).max(8)

export const claimSchema = z.object({
  text: z.string().trim().min(1).max(400),
  cites: citesSchema,
})
export type Claim = z.infer<typeof claimSchema>

export const redFlagSchema = claimSchema.extend({
  category: z.enum(RED_FLAG_CATEGORIES),
  /** Why this matters for a GCC hire (visa, end-of-service, salary delays…). */
  gccRelevance: z.string().trim().max(400).default(''),
})
export type RedFlag = z.infer<typeof redFlagSchema>

/** The editable draft and the confirmed summary share this shape. */
export const summaryDraftSchema = z.object({
  pros: z.array(claimSchema).max(8),
  cons: z.array(claimSchema).max(8),
  redFlags: z.array(redFlagSchema).max(8),
  gccNote: z.string().trim().max(600).default(''),
})
export type SummaryDraft = z.infer<typeof summaryDraftSchema>

export const confirmedSummarySchema = summaryDraftSchema.extend({
  confirmedAt: z.string(),
})
export type ConfirmedSummary = z.infer<typeof confirmedSummarySchema>

/** Citation id for one of the user's own ratings. */
export function ratingCiteId(site: ReviewSite): string {
  return `user:${site}`
}
