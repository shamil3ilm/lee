/**
 * v17 §1 — Scam Shield types. The rules engine is pure: it only sees the
 * text fields below and returns signals whose evidence spans are verbatim
 * substrings of those fields (so the UI can quote them and tests can prove
 * nothing was invented).
 */

export type RiskLevel = 'safe' | 'caution' | 'likely_scam'

export type SignalGroup = 'money' | 'identity' | 'channel' | 'sender' | 'content'

/** Every text field a rule may quote from. */
export type ScamField =
  | 'title'
  | 'company'
  | 'description'
  | 'url'
  | 'applyUrl'
  | 'applyEmail'
  | 'companyDomain'
  | 'salary'
  | 'location'
  | 'source'

export interface ScamSalary {
  min?: number | null
  max?: number | null
  currency?: string | null
}

/** Raw input: job/discovery text plus metadata. All optional. */
export interface ScamInput {
  title?: string | null
  company?: string | null
  description?: string | null
  /** Where the posting was found (listing URL). */
  url?: string | null
  applyUrl?: string | null
  applyEmail?: string | null
  /** The company's known domain or website (bare host or URL). */
  companyDomain?: string | null
  salary?: ScamSalary | null
  location?: string | null
  /** Source name, e.g. "greenhouse", "LinkedIn". */
  source?: string | null
}

/** Normalised view: every field is a string (possibly empty). */
export type ScamFields = Record<ScamField, string>

export interface EvidenceSpan {
  field: ScamField
  /** Offset into `fields[field]`. */
  start: number
  /** Verbatim `fields[field].slice(start, start + text.length)`. */
  text: string
}

export interface ScamSignal {
  id: string
  group: SignalGroup
  weight: number
  /** One-line human explanation shown in the "Why?" drawer. */
  label: string
  evidence: EvidenceSpan[]
}

/** Network facts about one domain (from lib/scam/net.ts, cached in DB). */
export interface DomainNetFacts {
  domain: string
  /** ISO date of RDAP "registration" event; null when unknown. */
  registeredAt: string | null
  /** true/false when the DNS-over-HTTPS lookup succeeded; null when unknown. */
  hasMx: boolean | null
  /** Age in days at assessment time; null when unknown. */
  ageDays: number | null
}

export interface NetContext {
  /** Facts per registrable domain; missing/unknown entries never raise risk. */
  domains: DomainNetFacts[]
  /** Domains that receive email for the posting (apply email etc.). */
  mailDomains: string[]
}

export interface ScamAssessment {
  score: number
  level: RiskLevel
  signals: ScamSignal[]
  rulesVersion: string
}
