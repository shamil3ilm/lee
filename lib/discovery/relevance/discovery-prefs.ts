import { z } from 'zod'
import { preferredRegionSchema, MAX_PREFERRED } from '@/lib/regions/preferred'

/**
 * Extra discovery preferences stored as one validated jsonb column
 * (`user_profile.discovery_prefs`): per-rule hard/soft handling, work
 * authorisation, pay floors, languages and notice period.
 *
 * "hard" → the posting goes to Filtered out with the reason.
 * "soft" → it stays in the inbox, ranked lower, with a visible chip.
 * "off"  → the rule is ignored.
 */

export const RULE_MODES = ['hard', 'soft', 'off'] as const
export type RuleMode = (typeof RULE_MODES)[number]

/**
 * Pay is not a rule: a posting below the user's range is always kept and only
 * ranked lower (never filtered), so it has no hard/soft/off switch.
 */
export const EXCLUSION_RULES = ['domain', 'sales', 'contract', 'shifts', 'support', 'visa', 'language', 'seniority'] as const
export type ExclusionRule = (typeof EXCLUSION_RULES)[number]

export const RULE_LABELS: Readonly<Record<ExclusionRule, string>> = {
  domain: 'Unrelated fields (marketing, HR, legal… with no overlap with my skills)',
  sales: 'Sales-heavy / pre-sales roles',
  contract: 'Contract / freelance only',
  shifts: 'Night / rotational shifts',
  support: 'Pure support (L1/L2) roles',
  visa: 'Nationals-only roles (e.g. Emiratisation, Saudization)',
  language: 'Language I don’t speak well required',
  seniority: 'Above my level (Senior / Lead title, 5+ years asked)',
}

/**
 * Defaults for a developer job-seeker; the user changes each per rule.
 *   visa       nationals-only openings are skipped ("UAE nationals
 *              preferred" stays a soft penalty either way);
 *   domain     filter postings with positive evidence of an unrelated field
 *              and little overlap with your ready skills (also before
 *              search preferences are saved); weak evidence is a chip;
 *   seniority  soft: a Senior / Lead / Staff title or a years ask only
 *              ranks lower (offset by a strong ready match); Principal,
 *              Director, Head of, VP and 10+ yr Architect roles are still
 *              filtered. "hard" filters any title or years above your
 *              levels; "off" ignores seniority.
 */
export const DEFAULT_RULE_MODES: Readonly<Record<ExclusionRule, RuleMode>> = {
  domain: 'hard',
  sales: 'hard',
  contract: 'hard',
  shifts: 'soft',
  support: 'soft',
  visa: 'hard',
  language: 'soft',
  seniority: 'soft',
}

export const NOTICE_PERIODS = ['immediate', '2_weeks', '1_month', '2_months', '3_months'] as const
export type NoticePeriod = (typeof NOTICE_PERIODS)[number]
export const NOTICE_LABELS: Readonly<Record<NoticePeriod, string>> = {
  immediate: 'Immediate',
  '2_weeks': '2 weeks',
  '1_month': '1 month',
  '2_months': '2 months',
  '3_months': '3 months',
}

/** "Immediate or 1 month" from the stored choices. */
export function noticeLabel(periods: readonly NoticePeriod[]): string | null {
  const sorted = NOTICE_PERIODS.filter((p) => periods.includes(p))
  return sorted.length > 0 ? sorted.map((p) => NOTICE_LABELS[p]).join(' or ') : null
}

export const LANGUAGE_LEVELS = ['basic', 'conversational', 'professional', 'fluent', 'native'] as const
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]

export const PAY_CURRENCIES = ['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'INR', 'USD'] as const
export type PayCurrency = (typeof PAY_CURRENCIES)[number]

/** Where a floor applies: India, the GCC as a whole, or one ISO-2 country. */
export const PAY_SCOPES = ['IN', 'GCC', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM'] as const
export type PayScope = (typeof PAY_SCOPES)[number]

/** Per-rule modes; unknown rules and invalid modes are dropped. */
const ruleModes = z.record(z.string(), z.unknown()).transform((raw) => {
  const out: Partial<Record<ExclusionRule, RuleMode>> = {}
  for (const rule of EXCLUSION_RULES) {
    const v = raw[rule]
    if (v === 'hard' || v === 'soft' || v === 'off') out[rule] = v
  }
  return out
})

export const payFloorSchema = z.object({
  scope: z.enum(PAY_SCOPES),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.enum(PAY_CURRENCIES),
  period: z.enum(['month', 'year']),
})
export type PayFloor = z.infer<typeof payFloorSchema>

export const languageSchema = z.object({
  name: z.string().trim().min(1).max(40),
  level: z.enum(LANGUAGE_LEVELS),
})
export type SpokenLanguage = z.infer<typeof languageSchema>

/**
 * Facts the user lets lee state in cover letters and outreach (region block,
 * lib/ai/prompts/application-facts.ts). Visa status, notice, relocation and
 * time zone are what they entered here for the search, so they default on;
 * nationality is off until they opt in. Pay (CTC) lives with the private
 * current job (lib/compare/types.ts `shareCtc`) and is never on by default.
 */
export const SHARE_FACTS = ['visa', 'notice', 'relocation', 'timezone', 'nationality'] as const
export type ShareFact = (typeof SHARE_FACTS)[number]
export const SHARE_FACT_LABELS: Readonly<Record<ShareFact, string>> = {
  visa: 'Visa status (GCC)',
  notice: 'Notice period',
  relocation: 'Availability to relocate (GCC)',
  timezone: 'Time zone (remote roles)',
  nationality: 'Nationality (GCC)',
}
export const shareSchema = z.object({
  visa: z.boolean().catch(true).default(true),
  notice: z.boolean().catch(true).default(true),
  relocation: z.boolean().catch(true).default(true),
  timezone: z.boolean().catch(true).default(true),
  nationality: z.boolean().catch(false).default(false),
})
export type ShareSettings = z.infer<typeof shareSchema>
export const DEFAULT_SHARE: ShareSettings = { visa: true, notice: true, relocation: true, timezone: true, nationality: false }

export const discoveryPrefsSchema = z.object({
  rules: ruleModes.catch({}),
  /** ISO-2 country the user lives in. */
  basedIn: z.string().regex(/^[A-Z]{2}$/).nullable().catch(null),
  /** ISO-2 countries where the user needs an employer to sponsor a visa. */
  sponsorshipFor: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20).catch([]),
  payFloors: z.array(payFloorSchema).max(10).catch([]),
  languages: z.array(languageSchema).max(12).catch([]),
  /** Notice periods the user can do, e.g. ["immediate", "1_month"]; shown, used later in outreach. */
  noticePeriods: z.array(z.enum(NOTICE_PERIODS)).max(NOTICE_PERIODS.length).catch([]),
  /**
   * Open to relocating anywhere (or to `relocationCountries`) when the
   * employer offers relocation or visa sponsorship: such a posting passes the
   * region rule with a "Relocation offered" chip. On unless turned off.
   */
  relocationIfSponsored: z.boolean().catch(true),
  /** ISO-2 countries or place groups (EU, AU…); empty = any country. */
  relocationCountries: z.array(z.string().regex(/^[A-Z_]{2,10}$/)).max(30).catch([]),
  share: shareSchema.catch(DEFAULT_SHARE).default(DEFAULT_SHARE),
  /**
   * Starred regions (lib/regions/preferred): a ranking boost in the Match
   * Score, the shortlist and company discovery; never a filter.
   */
  preferredRegions: z.array(preferredRegionSchema).max(MAX_PREFERRED).catch([]).default([]),
  /** Company stages the user prefers in company discovery; empty = no preference. */
  companyStages: z.array(z.enum(['startup', 'scaleup', 'enterprise'])).max(3).catch([]).default([]),
})
export type DiscoveryPrefs = z.infer<typeof discoveryPrefsSchema>

export const EMPTY_DISCOVERY_PREFS: DiscoveryPrefs = {
  rules: {},
  basedIn: null,
  sponsorshipFor: [],
  payFloors: [],
  languages: [],
  noticePeriods: [],
  relocationIfSponsored: true,
  relocationCountries: [],
  share: DEFAULT_SHARE,
  preferredRegions: [],
  companyStages: [],
}

/** Parse the stored jsonb leniently: unknown or broken parts fall back to defaults. */
export function parseDiscoveryPrefs(value: unknown): DiscoveryPrefs {
  const parsed = discoveryPrefsSchema.safeParse({ ...EMPTY_DISCOVERY_PREFS, ...(isObject(value) ? value : {}) })
  return parsed.success ? parsed.data : EMPTY_DISCOVERY_PREFS
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function ruleMode(prefs: DiscoveryPrefs, rule: ExclusionRule): RuleMode {
  return prefs.rules[rule] ?? DEFAULT_RULE_MODES[rule]
}
