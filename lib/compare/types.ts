import { z } from 'zod'

/**
 * "Compare with my current job" (docs/job-comparison.md). Client-safe
 * schemas and constants for the PRIVATE current job, the user's FX and
 * cost-of-living assumptions, and the comparison criteria.
 *
 * Private by default: none of this is part of the master profile, so it is
 * never mapped to the portfolio, and nothing here is ever logged.
 */

export const COMPARE_CURRENCIES = ['INR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'USD', 'EUR', 'GBP'] as const
export type CompareCurrency = (typeof COMPARE_CURRENCIES)[number]

/** Currencies with no USD peg: converted only through the user's FX table. */
export const FLOATING_CURRENCIES = ['INR', 'EUR', 'GBP'] as const
export type FloatingCurrency = (typeof FLOATING_CURRENCIES)[number]

/** Places with their own tax and cost-of-living assumptions. */
export const PLACES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN', 'OTHER'] as const
export type Place = (typeof PLACES)[number]

export const PLACE_LABELS: Readonly<Record<Place, string>> = {
  AE: 'UAE',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
  IN: 'India',
  OTHER: 'Elsewhere',
}

/** Costs for a place are entered in its own currency (rent in Dubai in AED). */
export const PLACE_CURRENCY: Readonly<Record<Place, CompareCurrency>> = {
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  BH: 'BHD',
  OM: 'OMR',
  IN: 'INR',
  OTHER: 'USD',
}

export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const
export type WorkMode = (typeof WORK_MODES)[number]

export const HEALTH_COVER = ['unknown', 'none', 'self', 'family'] as const
export type HealthCover = (typeof HEALTH_COVER)[number]

export const CRITERIA = ['pay', 'benefits', 'growth', 'environment', 'stability', 'location', 'work_life'] as const
export type Criterion = (typeof CRITERIA)[number]

export const CRITERION_LABELS: Readonly<Record<Criterion, string>> = {
  pay: 'Pay',
  benefits: 'Benefits',
  growth: 'Growth',
  environment: 'Environment',
  stability: 'Stability',
  location: 'Location & visa',
  work_life: 'Work-life',
}

export const RATING_KEYS = ['growth', 'techStack', 'manager', 'workLife', 'security', 'culture'] as const
export type RatingKey = (typeof RATING_KEYS)[number]

export const RATING_LABELS: Readonly<Record<RatingKey, string>> = {
  growth: 'Growth / learning',
  techStack: 'Tech stack',
  manager: 'Manager / mentorship',
  workLife: 'Work-life balance',
  security: 'Job security',
  culture: 'Team / culture',
}

export const MAX_WANT_MORE = 3

const text = (max: number) => z.string().trim().max(max)
const triState = z.boolean().nullable().default(null)
const rating = z.number().int().min(1).max(5).nullable().default(null)
const MONTH_PATTERN = /^[1-2][0-9]{3}-(0[1-9]|1[0-2])$/

export const currentBenefitsSchema = z.object({
  health: z.enum(HEALTH_COVER).default('unknown'),
  bonus: triState,
  bonusNote: text(200).default(''),
  pfGratuity: triState,
  leaveDays: z.number().int().min(0).max(120).nullable().default(null),
  wfh: triState,
  learningBudget: triState,
  housing: triState,
  transport: triState,
  flights: triState,
  other: text(500).default(''),
})
export type CurrentBenefits = z.infer<typeof currentBenefitsSchema>

export const currentJobSchema = z.object({
  employer: text(200).default(''),
  title: text(200).default(''),
  location: text(200).default(''),
  place: z.enum(PLACES).nullable().default(null),
  workMode: z.enum(WORK_MODES).nullable().default(null),
  /** yyyy-mm, or empty. */
  startDate: z.union([z.literal(''), z.string().regex(MONTH_PATTERN)]).default(''),
  /** Monthly gross pay in `currency`; null = not entered. */
  monthlyGross: z.number().positive().max(1_000_000_000).nullable().default(null),
  currency: z.enum(COMPARE_CURRENCIES).default('INR'),
  benefits: currentBenefitsSchema.default(currentBenefitsSchema.parse({})),
  commuteNotes: text(500).default(''),
  ratings: z
    .object({
      growth: rating,
      techStack: rating,
      manager: rating,
      workLife: rating,
      security: rating,
      culture: rating,
    })
    .default({ growth: null, techStack: null, manager: null, workLife: null, security: null, culture: null }),
  /** Criteria to weight higher (up to three). */
  wantMore: z.array(z.enum(CRITERIA)).max(MAX_WANT_MORE).default([]),
})
export type CurrentJob = z.infer<typeof currentJobSchema>

export const placeAssumptionSchema = z.object({
  /** Effective income tax, percent of gross (0–60). Null = not set. */
  taxRate: z.number().min(0).max(60).nullable().default(null),
  /** Monthly housing cost in the place's currency. */
  housing: z.number().min(0).max(100_000_000).nullable().default(null),
  /** Other monthly living costs in the place's currency. */
  living: z.number().min(0).max(100_000_000).nullable().default(null),
})
export type PlaceAssumption = z.infer<typeof placeAssumptionSchema>

const DAY_PATTERN = /^[1-2][0-9]{3}-[0-1][0-9]-[0-3][0-9]$/

export const fxTableSchema = z.object({
  /** Units of each floating currency per 1 USD; null = not set. */
  rates: z
    .object({ INR: z.number().positive().nullable().default(null), EUR: z.number().positive().nullable().default(null), GBP: z.number().positive().nullable().default(null) })
    .default({ INR: null, EUR: null, GBP: null }),
  /** yyyy-mm-dd the user last updated the table. */
  updatedAt: z.union([z.literal(''), z.string().regex(DAY_PATTERN)]).default(''),
  /** Where the current numbers came from. */
  source: z.enum(['manual', 'ecb']).default('manual'),
})
export type FxTable = z.infer<typeof fxTableSchema>

/** GCC states levy no personal income tax on salaries (Oman: from 2028, high earners only). */
export const DEFAULT_TAX: Readonly<Record<Place, number | null>> = {
  AE: 0,
  SA: 0,
  QA: 0,
  KW: 0,
  BH: 0,
  OM: 0,
  IN: null,
  OTHER: null,
}

export const assumptionsSchema = z.object({
  fx: fxTableSchema.default(fxTableSchema.parse({})),
  places: z.partialRecord(z.enum(PLACES), placeAssumptionSchema).default({}),
})
export type Assumptions = z.infer<typeof assumptionsSchema>

export function parseCurrentJob(value: unknown): CurrentJob | null {
  if (value === null || value === undefined) return null
  const r = currentJobSchema.safeParse(value)
  return r.success ? r.data : null
}

export function parseAssumptions(value: unknown): Assumptions {
  const r = assumptionsSchema.safeParse(value ?? {})
  return r.success ? r.data : assumptionsSchema.parse({})
}

/** The tax rate for a place: the user's own, else the known default (GCC: 0). */
export function placeAssumption(a: Assumptions, place: Place): PlaceAssumption & { taxDefault: boolean } {
  const own = a.places[place]
  const taxRate = own?.taxRate ?? DEFAULT_TAX[place]
  return {
    taxRate,
    housing: own?.housing ?? null,
    living: own?.living ?? null,
    taxDefault: own?.taxRate === null || own?.taxRate === undefined,
  }
}

/** Weights from "what I want more of": 1 each, 2 for the picked criteria. */
export function defaultWeights(wantMore: readonly Criterion[]): Record<Criterion, number> {
  return Object.fromEntries(CRITERIA.map((c) => [c, wantMore.includes(c) ? 2 : 1])) as Record<Criterion, number>
}
