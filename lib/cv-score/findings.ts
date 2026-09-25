/**
 * v12.0 — finding construction + ordering helpers.
 */
import { shortHash } from './text'
import type {
  ComponentHeadlineKey,
  CvFinding,
  DimensionKey,
  FindingFix,
  Severity,
} from './types'

/** Which headline score(s) each dimension feeds. */
export const DIMENSION_HEADLINES: Record<DimensionKey, ComponentHeadlineKey[]> = {
  keywords: ['skillsMatch'],
  requirementFit: ['roleMatch'],
  roleAlignment: ['roleMatch'],
  seniority: ['experienceMatch'],
  domain: ['experienceMatch'],
  ats: ['ats'],
  impact: ['impact'],
  readability: ['readability'],
  structure: ['structure'],
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 }

export interface FindingInput {
  severity: Severity
  message: string
  location?: CvFinding['location']
  suggestion?: string
  fix?: FindingFix
  /** Override the default headline tags for this dimension. */
  headlines?: ComponentHeadlineKey[]
}

export function makeFinding(
  dimension: DimensionKey,
  input: FindingInput,
  canAutofix = false,
): CvFinding {
  const idSeed = [
    dimension,
    input.message,
    input.location?.section ?? '',
    String(input.location?.index ?? ''),
    input.fix ? JSON.stringify(input.fix) : '',
  ].join('|')
  const autoFixable = canAutofix && !!input.fix
  return {
    id: `${dimension}-${shortHash(idSeed)}`,
    dimension,
    headlines: input.headlines ?? DIMENSION_HEADLINES[dimension],
    severity: input.severity,
    message: input.message,
    ...(input.location ? { location: input.location } : {}),
    ...(input.suggestion ? { suggestion: input.suggestion } : {}),
    autoFixable,
    ...(autoFixable && input.fix ? { fix: input.fix } : {}),
  }
}

/**
 * Sort findings: severity first, then by the Total-Match weight of the
 * headline the finding affects (heavier score first), then original order.
 */
export function sortFindings(
  findings: CvFinding[],
  headlineWeight: (k: ComponentHeadlineKey) => number,
): CvFinding[] {
  const weightOf = (f: CvFinding): number => Math.max(0, ...f.headlines.map(headlineWeight))
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const s = SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity]
      if (s !== 0) return s
      const w = weightOf(b.f) - weightOf(a.f)
      if (w !== 0) return w
      return a.i - b.i
    })
    .map(({ f }) => f)
}
