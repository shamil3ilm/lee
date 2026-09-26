import { buildContext } from './context'
import { hostOf, registrableDomain } from './domains'
import { RULES } from './rules'
import type { ObservedHost, RuleContext } from './rules/types'
import { toFields } from './text'
import type {
  DomainNetFacts,
  EvidenceSpan,
  NetContext,
  RiskLevel,
  ScamAssessment,
  ScamInput,
  ScamSignal,
} from './types'
import { CAUTION_AT, LIKELY_SCAM_AT, RULES_VERSION } from './version'

/** Net-check rules (only added when a lookup actually succeeded). */
export const YOUNG_DOMAIN_DAYS = 90
export const NET_WEIGHTS = { young: 30, noMx: 20 } as const

const LEVEL_RANK: Record<RiskLevel, number> = { safe: 0, caution: 1, likely_scam: 2 }

export function levelFor(score: number): RiskLevel {
  if (score >= LIKELY_SCAM_AT) return 'likely_scam'
  if (score >= CAUTION_AT) return 'caution'
  return 'safe'
}

/** The higher of two levels. */
export function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

/**
 * Merge a second opinion (future AI pass) into a rule-based level. Scam
 * text is untrusted input, so an AI can only RAISE the level — never lower it.
 */
export function mergeSecondOpinion(ruleLevel: RiskLevel, aiLevel: RiskLevel | null | undefined): RiskLevel {
  return aiLevel ? maxLevel(ruleLevel, aiLevel) : ruleLevel
}

export function scoreSignals(signals: readonly ScamSignal[]): number {
  const total = signals.reduce((s, sig) => s + sig.weight, 0)
  return Math.max(0, Math.min(100, Math.round(total)))
}

function runRules(ctx: RuleContext): ScamSignal[] {
  const out: ScamSignal[] = []
  for (const rule of RULES) {
    const hit = rule.detect(ctx)
    if (!hit || hit.evidence.length === 0) continue
    out.push({
      id: rule.id,
      group: rule.group,
      weight: hit.weight ?? rule.weight,
      label: hit.label ?? rule.label,
      evidence: hit.evidence,
    })
  }
  return out
}

function companySpan(ctx: RuleContext): EvidenceSpan {
  const raw = ctx.fields.companyDomain
  const trimmed = raw.trim()
  return { field: 'companyDomain', start: raw.indexOf(trimmed), text: trimmed }
}

function factsFor(net: NetContext, host: string): DomainNetFacts | undefined {
  const reg = registrableDomain(host)
  return net.domains.find((d) => d.domain === reg)
}

/**
 * Signals from cached network facts. Unknown facts (lookup failed, timed
 * out, disabled) never add risk. Free-mail and job-platform hosts are
 * excluded upstream by the caller choosing which domains to look up.
 */
function netSignals(ctx: RuleContext, net: NetContext | null | undefined): ScamSignal[] {
  if (!net || net.domains.length === 0) return []
  const companyHost = hostOf(ctx.fields.companyDomain)
  const companyRef: ObservedHost[] =
    companyHost && ctx.fields.companyDomain.trim()
      ? [{ field: 'url', host: companyHost, via: 'link', span: companySpan(ctx) }]
      : []
  const young = [...ctx.hosts, ...companyRef].filter((h) => {
    const f = factsFor(net, h.host)
    return f?.ageDays !== null && f?.ageDays !== undefined && f.ageDays < YOUNG_DOMAIN_DAYS
  })
  const mail = new Set(net.mailDomains.map((d) => registrableDomain(d)))
  const noMx = ctx.hosts.filter((h) => {
    if (h.via !== 'email' || !mail.has(registrableDomain(h.host))) return false
    return factsFor(net, h.host)?.hasMx === false
  })
  const out: ScamSignal[] = []
  if (young.length > 0) {
    out.push({
      id: 'sender.young_domain',
      group: 'sender',
      weight: NET_WEIGHTS.young,
      label: `Domain registered less than ${YOUNG_DOMAIN_DAYS} days ago`,
      evidence: young.slice(0, 2).map((h) => h.span),
    })
  }
  if (noMx.length > 0) {
    out.push({
      id: 'sender.no_mx',
      group: 'sender',
      weight: NET_WEIGHTS.noMx,
      label: 'Recruiter email domain cannot receive mail (no MX records)',
      evidence: noMx.slice(0, 2).map((h) => h.span),
    })
  }
  return out
}

/**
 * Pure, deterministic Scam Shield assessment. Same input + same net facts
 * + same RULES_VERSION → same output.
 */
export function assessScam(input: ScamInput, net?: NetContext | null): ScamAssessment {
  const ctx = buildContext(toFields(input))
  const signals = [...runRules(ctx), ...netSignals(ctx, net)]
  const score = scoreSignals(signals)
  return { score, level: levelFor(score), signals, rulesVersion: RULES_VERSION }
}

/** Registrable domains worth a network lookup (not free-mail/platform/etc.). */
export { lookupCandidates } from './candidates'
