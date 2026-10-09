import type { ApplicationFacts } from '@/lib/ai/prompts/application-facts'
import { SKILL_GROUPS } from '@/lib/discovery/relevance/roles'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import { INDUSTRY_LABELS, isIndustry } from './industry'

/**
 * The speculative "Reach out" draft: a short, region-aware email or
 * LinkedIn message to a company with no open role. FACT-LOCKED: every fact
 * comes from `SpeculativeFacts` (the candidate's master CV and chosen
 * variant, the opted-in region facts, the company's public facts). An AI
 * rewrite is accepted only when `factLock` finds nothing outside them;
 * otherwise the deterministic template is used. lee never sends it.
 * Pure, client-safe.
 */

export type SpeculativeChannel = 'email' | 'linkedin'

export type SpeculativeContact =
  /** One of the user's own LinkedIn connections (referral ask). */
  | { kind: 'referral'; name: string; position: string }
  /** A role address published on the company's own site. */
  | { kind: 'role_email'; email: string }
  | { kind: 'none' }

export interface SpeculativeFacts {
  channel: SpeculativeChannel
  company: { name: string; industries: string[]; place: string | null; description: string | null }
  candidate: {
    name: string
    headline: string
    /** Skills that are ready AND relevant to the company's domain, best first (≤ 5). */
    skills: string[]
    /** One real bullet from the CV (verbatim), or null. */
    highlight: string | null
    /** The current or latest role ("Backend Developer at …"), verbatim. */
    currentRole: string | null
    /** Résumé variant chosen for the company's domain. */
    variantName: string | null
  }
  contact: SpeculativeContact
  regionFacts: ApplicationFacts | null
}

export interface SpeculativeDraft {
  channel: SpeculativeChannel
  subject: string | null
  body: string
  to: string | null
  /** 'template' (deterministic) or 'ai' (an AI rewrite that passed the fact lock). */
  origin: 'template' | 'ai'
  /** Why an AI rewrite was rejected, when it was. */
  rejected?: string[]
}

export const LIMITS = { email: 1_200, linkedin: 700 } as const

function domainPhrase(f: SpeculativeFacts): string {
  const tags = f.company.industries.filter(isIndustry).slice(0, 2).map((t) => INDUSTRY_LABELS[t].toLowerCase())
  return tags.length > 0 ? tags.join(' and ') : 'software'
}

function greeting(f: SpeculativeFacts): string {
  if (f.contact.kind === 'referral') return `Hi ${f.contact.name.split(' ')[0] || f.contact.name},`
  return f.channel === 'email' ? `Dear ${f.company.name} hiring team,` : 'Hello,'
}

function regionLine(f: SpeculativeFacts): string | null {
  const lines = f.regionFacts?.lines ?? []
  if (lines.length === 0) return null
  return lines.map((l) => `${l.label}: ${l.value}.`).join(' ')
}

/** The deterministic draft: only the facts, in a fixed shape. */
export function templateDraft(f: SpeculativeFacts): SpeculativeDraft {
  const skills = f.candidate.skills.slice(0, 4).join(', ')
  const where = f.company.place ? ` in ${f.company.place}` : ''
  const ask =
    f.contact.kind === 'referral'
      ? `Would you be open to a short chat about the team, or to pointing me to the right person? I am happy to share my CV first.`
      : `If there is a fit now or later, I would be glad to share my CV and talk.`
  const intro =
    f.contact.kind === 'referral'
      ? `I am exploring engineering roles at ${f.company.name}${where} and saw that you work there.`
      : `I am reaching out to ask whether ${f.company.name}${where} has room for an engineer in its ${domainPhrase(f)} work, even without an open posting.`
  const me = [
    `I am ${f.candidate.name}, ${f.candidate.headline}${f.candidate.currentRole ? ` (${f.candidate.currentRole})` : ''}.`,
    skills ? `My ready skills include ${skills}.` : null,
    f.candidate.highlight ? `For example: ${f.candidate.highlight.replace(/[.\s]+$/, '')}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const parts = [greeting(f), '', intro, '', me, regionLine(f), '', ask, '', `Thank you,\n${f.candidate.name}`].filter(
    (p): p is string => p !== null,
  )
  const body = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return {
    channel: f.channel,
    subject: f.channel === 'email' ? `Engineering roles at ${f.company.name}` : null,
    body: f.channel === 'linkedin' ? body.slice(0, LIMITS.linkedin) : body.slice(0, LIMITS.email),
    to: f.contact.kind === 'role_email' ? f.contact.email : null,
    origin: 'template',
  }
}

/** All text a draft may draw on. */
export function factCorpus(f: SpeculativeFacts): string {
  return [
    f.company.name,
    f.company.place ?? '',
    f.company.description ?? '',
    f.company.industries.filter(isIndustry).map((t) => INDUSTRY_LABELS[t]).join(' '),
    f.candidate.name,
    f.candidate.headline,
    f.candidate.skills.join(' '),
    f.candidate.highlight ?? '',
    f.candidate.currentRole ?? '',
    f.candidate.variantName ?? '',
    f.contact.kind === 'referral' ? `${f.contact.name} ${f.contact.position}` : '',
    f.contact.kind === 'role_email' ? f.contact.email : '',
    (f.regionFacts?.lines ?? []).map((l) => `${l.label} ${l.value}`).join(' '),
  ].join('\n')
}

/** Technology words a draft could invent (plain English words such as "go" or "express" left out). */
const ENGLISH = new Set(['go', 'express', 'backend', 'back-end', 'frontend', 'front-end', 'server-side', 'api', 'apis', 'orm', 'html', 'css', 'linux', 'devops', 'serverless', 'spring', 'rails', 'phoenix', 'swift'])
const ALL_SKILLS: readonly string[] = [
  ...new Set(
    [SKILL_GROUPS.backend, SKILL_GROUPS.frontend, SKILL_GROUPS.devops, SKILL_GROUPS.llm, SKILL_GROUPS.integrations, SKILL_GROUPS.analyticsEng]
      .flat()
      .filter((t) => !ENGLISH.has(t)),
  ),
]
const NUMBER = /\d+(?:[.,]\d+)*/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi
/** Claims a speculative note must never make up. */
const RISKY = /\b(?:\d+\s*(?:years?|yrs?)|referred by|you (?:are|were) hiring|your (?:opening|vacancy|job post)|salary|ctc|lpa|visa)\b/i

/**
 * Which parts of `body` are not backed by the facts: numbers, email
 * addresses, links and skill/technology terms that the corpus does not
 * contain, and claims a speculative note must not invent. Empty = passes.
 */
export function factLock(body: string, f: SpeculativeFacts): string[] {
  const corpus = factCorpus(f)
  const nCorpus = normalizeForMatch(corpus)
  const issues: string[] = []
  for (const m of body.match(NUMBER) ?? []) if (!corpus.includes(m)) issues.push(`number "${m}"`)
  for (const m of body.match(EMAIL) ?? []) if (!corpus.toLowerCase().includes(m.toLowerCase())) issues.push(`email "${m}"`)
  for (const m of body.match(URL_RE) ?? []) if (!corpus.includes(m)) issues.push(`link "${m}"`)
  const nBody = normalizeForMatch(body)
  const known = new Set(findTerms(nCorpus, ALL_SKILLS))
  for (const t of findTerms(nBody, ALL_SKILLS)) if (!known.has(t)) issues.push(`skill "${t}"`)
  const risky = RISKY.exec(body)
  if (risky && !nCorpus.includes(normalizeForMatch(risky[0]))) issues.push(`claim "${risky[0]}"`)
  if (body.length > LIMITS[f.channel]) issues.push(`too long (${body.length} characters)`)
  return [...new Set(issues)]
}

/** Accept an AI rewrite only when it passes the fact lock; else the template, with the reasons. */
export function lockedDraft(f: SpeculativeFacts, ai: { subject?: string | null; body: string } | null): SpeculativeDraft {
  const base = templateDraft(f)
  if (!ai || !ai.body.trim()) return base
  const issues = factLock(`${ai.subject ?? ''}\n${ai.body}`, f)
  if (issues.length > 0) return { ...base, rejected: issues }
  return {
    ...base,
    subject: f.channel === 'email' ? (ai.subject?.trim() || base.subject) : null,
    body: ai.body.trim(),
    origin: 'ai',
  }
}
