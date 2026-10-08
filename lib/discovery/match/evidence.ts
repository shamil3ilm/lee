import { evidenceOf, isSkillBacked, presentableTexts, presentation, readyHighlights } from '@/lib/resume/readiness'
import { readResumeProfile, type ResumeProfile } from '@/lib/resume/types'
import { findTerms, normalizeForMatch } from '../relevance/text'
import { canonicalSkill, skillsInText, withImplied } from './lexicon'

/**
 * READY profile evidence (no search-preference imports, so the relevance
 * prefs can use it too):
 *   - résumé skills that are interview-ready or backed by a ready item
 *     (lib/resume/readiness: isSkillBacked);
 *   - skills named by interview-ready work and projects;
 *   - domain skills (payments, e-invoicing) also from domain-ready items.
 * Not-ready (learning / AI-assisted) items never count. Without a stored
 * résumé the legacy settings skills are used (they seed the résumé as
 * "own", i.e. ready).
 */

export interface EvidenceSource {
  resume?: unknown
  skills?: readonly string[] | null
  stackWeights?: unknown
}

export interface ReadyEvidence {
  skills: Set<string>
  domains: Set<string>
  resume: ResumeProfile | null
  /** Ready lines shown as evidence ("Built payment webhooks in Laravel"). */
  lines: string[]
}

/** Ready (or domain-worded) highlight and item lines, as written. */
function evidenceLines(resume: ResumeProfile, skillNames: readonly string[]): string[] {
  const out: string[] = []
  for (const w of resume.work) {
    const ready = readyHighlights(w.highlights)
    if (ready.length > 0) out.push(`${w.position}${w.keywords.length ? ` (${w.keywords.join(', ')})` : ''}`)
    out.push(...ready.map((h) => h.text), ...presentableTexts(w.highlights.filter((h) => !h.interviewReady)))
  }
  for (const p of resume.projects) {
    const mode = presentation(p)
    if (mode === 'excluded') continue
    if (mode === 'full') out.push(`${p.name}: ${p.description}${p.keywords.length ? ` (${p.keywords.join(', ')})` : ''}`)
    out.push(...presentableTexts(p.highlights))
  }
  if (skillNames.length > 0) out.push(`Skills: ${skillNames.join(', ')}`)
  return [...new Set(out.map((l) => l.trim()).filter(Boolean))].slice(0, 120)
}

export const PAYMENTS_TERMS = [
  'payments', 'payment gateway', 'payment gateways', 'payment processing', 'payment integration',
  'payment integrations', 'fintech', 'stripe', 'paytabs', 'checkout.com', 'adyen', 'telr', 'ach',
  'nacha', 'wallet', 'wallets', 'remittance', 'remittances', 'payouts', 'card issuing', 'acquiring',
  'open banking', 'pci dss', 'pci-dss', 'reconciliation', 'cheque', 'cheques', 'e-check', 'e-checks',
  'bnpl', 'buy now pay later',
] as const

export const EINVOICING_TERMS = [
  'zatca', 'fatoora', 'e-invoicing', 'einvoicing', 'e-invoice', 'e-invoices', 'electronic invoicing',
  'electronic invoice', 'peppol', 'xades', 'ubl', 'en 16931', 'en16931', 'fta e-invoicing',
  'الفوترة الإلكترونية', 'فاتورة',
] as const

function readySkillNames(resume: ResumeProfile): { tech: string[]; domain: string[] } {
  const evidence = evidenceOf(resume)
  const tech: string[] = []
  const domain: string[] = []
  for (const g of resume.skills) {
    for (const s of g.skills) {
      if (!isSkillBacked(s, evidence)) continue
      if (s.kind === 'domain') domain.push(s.name)
      else tech.push(s.name)
    }
  }
  return { tech, domain }
}

function skillSet(names: readonly string[], evidenceText: string): Set<string> {
  const out = new Set<string>()
  for (const n of names) {
    const c = canonicalSkill(n)
    if (c) out.add(c)
  }
  for (const c of skillsInText(evidenceText)) out.add(c)
  return withImplied(out)
}

function domainsOf(text: string): Set<string> {
  const out = new Set<string>()
  if (findTerms(text, PAYMENTS_TERMS).length > 0) out.add('payments')
  if (findTerms(text, EINVOICING_TERMS).length > 0) out.add('einvoicing')
  return out
}

export function readyEvidence(profile: EvidenceSource | null | undefined): ReadyEvidence {
  const resume = readResumeProfile(profile?.resume)
  if (resume) {
    const evidence = evidenceOf(resume)
    const names = readySkillNames(resume)
    const domainText = normalizeForMatch([evidence.full, evidence.domain, ...names.tech, ...names.domain].join(' | '))
    return {
      skills: skillSet(names.tech, evidence.full),
      domains: domainsOf(domainText),
      resume,
      lines: evidenceLines(resume, [...names.tech, ...names.domain]),
    }
  }
  const weights =
    profile?.stackWeights && typeof profile.stackWeights === 'object' ? Object.keys(profile.stackWeights) : []
  const names = [...(profile?.skills ?? []), ...weights]
  return {
    skills: skillSet(names, ''),
    domains: domainsOf(normalizeForMatch(names.join(' | '))),
    resume: null,
    lines: names.length > 0 ? [`Skills: ${names.join(', ')}`] : [],
  }
}
