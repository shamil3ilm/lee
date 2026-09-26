import type { EvidenceSpan, ScamFields, SignalGroup } from '../types'

/** A host seen somewhere in the input, with the field it came from. */
export interface ObservedHost {
  field: 'url' | 'applyUrl' | 'applyEmail' | 'description'
  host: string
  /** How it was referenced: a link or an email address. */
  via: 'link' | 'email'
  /** Verbatim span of the host (or the whole reference) in its field. */
  span: EvidenceSpan
}

export interface RuleContext {
  fields: ScamFields
  /** Legit domains for the claimed company (input domain + known map). */
  legitDomains: string[]
  /** True when the company name matches a well-known employer. */
  knownCompany: boolean
  /** Span of the company name in the `company` field (whole field). */
  companySpan: EvidenceSpan | null
  hosts: ObservedHost[]
}

export interface Detection {
  evidence: EvidenceSpan[]
  /** Overrides the rule's default weight (e.g. stronger when a brand is claimed). */
  weight?: number
  label?: string
}

export interface Rule {
  id: string
  group: SignalGroup
  /** Default weight; the score is the capped sum of fired weights. */
  weight: number
  label: string
  detect(ctx: RuleContext): Detection | null
}

/** Wrap a span list: fire only when non-empty. */
export function fired(evidence: EvidenceSpan[], extra: Omit<Detection, 'evidence'> = {}): Detection | null {
  return evidence.length > 0 ? { evidence, ...extra } : null
}
