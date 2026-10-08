import { compileTerms, matchTerms } from '../match'
import { normalizeName } from '../text'
import { releaseProject } from './projects'

/**
 * Personal relevance of a "what's new" entry, computed per user at read
 * time (nothing personal is stored with the shared rows). Topics come from
 * the master profile's ready skills, the study list (Playground targets),
 * the search preferences' role families and the user's release list; an
 * entry matching a topic (word boundaries, in its name, summary or tags)
 * gains that topic's weight. Pure.
 */

export type RelevanceReason = 'ready_skill' | 'study' | 'stack' | 'role_family'

export const REASON_WEIGHT: Readonly<Record<RelevanceReason, number>> = {
  ready_skill: 0.5,
  study: 0.4,
  stack: 0.4,
  role_family: 0.3,
}

export const REASON_LABELS: Readonly<Record<RelevanceReason, string>> = {
  ready_skill: 'ready skill',
  study: 'study list',
  stack: 'your releases',
  role_family: 'role family',
}

export interface RelevanceTopic {
  label: string
  reason: RelevanceReason
  /** Words that select it (the label first). */
  terms: readonly string[]
  /** Tags that select it exactly (release project ids, short skill names). */
  tags: readonly string[]
}

/** Role families (lib/discovery/relevance/roles.ts) → the topics their news is about. */
const ROLE_FAMILY_TOPICS: Readonly<Record<string, { label: string; terms: readonly string[] }>> = {
  backend: { label: 'Backend', terms: ['backend', 'microservices', 'orm', 'rest api'] },
  fullstack: { label: 'Full-stack', terms: ['full-stack', 'fullstack', 'web framework'] },
  frontend: { label: 'Frontend', terms: ['frontend', 'css', 'ui components'] },
  api_integration: { label: 'API integration', terms: ['webhook', 'webhooks', 'api integration', 'api gateway', 'graphql', 'openapi'] },
  payments: { label: 'Payments', terms: ['payments', 'payment', 'fintech', 'stripe', 'billing', 'invoicing', 'checkout'] },
  einvoicing: { label: 'E-invoicing', terms: ['e-invoicing', 'einvoicing', 'zatca', 'invoice', 'invoicing'] },
  erp: { label: 'ERP', terms: ['erp', 'odoo', 'accounting'] },
  devops: { label: 'DevOps', terms: ['devops', 'kubernetes', 'docker', 'ci/cd', 'observability', 'terraform'] },
  mobile: { label: 'Mobile', terms: ['android', 'ios', 'flutter', 'react native'] },
  data_analyst: { label: 'Data / BI', terms: ['data', 'bi', 'analytics', 'dashboard', 'sql'] },
  analytics_eng: { label: 'Analytics engineering', terms: ['dbt', 'analytics', 'sql', 'data warehouse'] },
  data: { label: 'Data engineering', terms: ['etl', 'data pipeline', 'data engineering', 'sql', 'streaming'] },
  ml: { label: 'ML engineering', terms: ['machine learning', 'pytorch', 'training', 'fine-tuning'] },
  llm_app: { label: 'LLM integration', terms: ['llm', 'rag', 'agents', 'agent', 'mcp', 'embedding', 'embeddings', 'prompt'] },
  qa_automation: { label: 'QA automation', terms: ['testing', 'playwright', 'e2e', 'test automation'] },
  security: { label: 'Security', terms: ['security', 'vulnerability', 'authentication', 'encryption'] },
}

/** Names this short only match tags exactly ("Go", "R", "C" are too common as words). */
const MIN_TEXT_TERM = 3

export function buildRelevanceTopics(input: {
  readySkills: readonly string[]
  studySkills: readonly string[]
  roleFamilies: readonly string[]
  releaseProjects: readonly string[]
}): RelevanceTopic[] {
  const out: RelevanceTopic[] = []
  const seen = new Set<string>()
  const add = (label: string, reason: RelevanceReason, terms: readonly string[], tags: readonly string[]): void => {
    const key = `${reason}:${normalizeName(label)}`
    if (!label.trim() || seen.has(key)) return
    seen.add(key)
    out.push({ label: label.trim(), reason, terms, tags })
  }
  const skill = (name: string, reason: RelevanceReason): void => {
    const short = normalizeName(name).length < MIN_TEXT_TERM
    add(name, reason, short ? [] : [name], [name.toLowerCase()])
  }
  for (const s of input.readySkills) skill(s, 'ready_skill')
  for (const s of input.studySkills) skill(s, 'study')
  for (const id of input.releaseProjects) {
    const p = releaseProject(id)
    if (p) add(p.label, 'stack', [], [p.id])
  }
  for (const f of input.roleFamilies) {
    const t = ROLE_FAMILY_TOPICS[f]
    if (t) add(t.label, 'role_family', t.terms, [])
  }
  return out
}

export interface RelevanceChip {
  label: string
  reason: RelevanceReason
}

export interface Relevance {
  /** 0..1 */
  score: number
  chips: RelevanceChip[]
}

export interface RelevanceTarget {
  /** Release-list topics only count for releases (a TypeScript repo is not a TypeScript release). */
  category?: string
  name: string
  excerpt: string
  tags: readonly string[]
}

const MAX_CHIPS = 3

/** Precompiled matchers, built once per request. */
export function relevanceMatcher(topics: readonly RelevanceTopic[]): (t: RelevanceTarget) => Relevance {
  const compiled = compileTerms(
    topics.flatMap((t, i) => {
      const [first, ...rest] = t.terms
      return first ? [{ id: String(i), term: first, aliases: rest }] : []
    }),
  )
  return (target) => {
    const tags = new Set(target.tags.map((t) => t.toLowerCase()))
    const hit = new Set(matchTerms([target.name, target.excerpt, target.tags.join(' ')], compiled).map(Number))
    topics.forEach((t, i) => {
      if (t.reason === 'stack' && target.category !== 'release') return
      if (t.tags.some((tag) => tags.has(tag))) hit.add(i)
    })
    const matched = [...hit].map((i) => topics[i] as RelevanceTopic).sort((a, b) => REASON_WEIGHT[b.reason] - REASON_WEIGHT[a.reason])
    const score = Math.min(1, matched.reduce((s, t) => s + REASON_WEIGHT[t.reason], 0))
    return { score, chips: matched.slice(0, MAX_CHIPS).map((t) => ({ label: t.label, reason: t.reason })) }
  }
}
