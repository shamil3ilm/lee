import type { MasterCV } from '@/lib/documents/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import { resolveRoleFamily, roleFamilyLabel, SKILL_GROUPS, ROLE_FAMILIES } from './roles'
import { normalizeForMatch, findTerms } from './text'
import { readLinkedProfile } from '@/lib/profile/url-import'

/**
 * "What else suits me": deterministic role suggestions from the user's
 * PROFILE and MASTER CV only. Tailored CVs and cover letters are rewritten
 * per job and would skew the signal, so they are never an input here.
 *
 * Each suggestion names the profile/CV evidence behind it; nothing is
 * applied until the user accepts it (accepted → added to role_types).
 */

export type SuggestionPriority = 'strong' | 'possible' | 'stretch' | 'fallback'

export interface RoleSuggestion {
  /** Unique per suggestion (two can share a family, e.g. two full-stack flavours). */
  id: string
  /** Role family added to role_types on accept. */
  family: string
  label: string
  reasons: string[]
  priority: SuggestionPriority
  source: 'rules' | 'ai'
}

export interface SuggestionResult {
  suggestions: RoleSuggestion[]
  /** Too little profile/CV evidence to suggest well. */
  sparse: boolean
  hasProfile: boolean
  hasMasterCv: boolean
}

export type SuggestionProfile = Pick<
  UserProfile,
  | 'headline'
  | 'summaryMd'
  | 'careerNarrativeMd'
  | 'skills'
  | 'industries'
  | 'roleTypes'
  | 'yearsExperience'
  | 'stackWeights'
  | 'dismissedRoleSuggestions'
> &
  Partial<Pick<UserProfile, 'linkedProfile'>>

export interface SuggestionInput {
  profile: SuggestionProfile | null
  masterCv: MasterCV | null
}

/**
 * Short or common words that are skills in a list ("Go", "API") but noise
 * in prose ("go live", "the API team"); only matched in skill lists.
 */
const LIST_ONLY = new Set(['go', 'api', 'apis', 'sql', 'qa', 'e2e', 'ios', 'rag', 'iam', 'sla', 'rca', 'ach', 'aml', 'kyc', 'kyb', 'vat', 'gst', 'ubl', 'sap', 'erp', 'orm', 'integration', 'integrations', 'payment', 'billing', 'banking', 'training', 'clients', 'customers', 'incident', 'incidents', 'debugging', 'linux', 'css', 'html', 'java', 'node', 'rest api', 'invoicing'])

interface Corpus {
  /** Skill lists: profile skills, stack weights, CV skills and tech tags. */
  profileList: string
  cvList: string
  /** Prose: headline, summary, narrative, CV bullets and descriptions. */
  profileText: string
  cvText: string
  industries: string
}

function joinNorm(parts: ReadonlyArray<string | null | undefined>): string {
  return normalizeForMatch(parts.filter(Boolean).join(' | '))
}

function buildCorpus({ profile, masterCv }: SuggestionInput): Corpus {
  const weights = profile?.stackWeights && typeof profile.stackWeights === 'object'
    ? Object.keys(profile.stackWeights as Record<string, unknown>)
    : []
  const cv = masterCv
  const page = readLinkedProfile(profile?.linkedProfile)
  return {
    profileList: joinNorm([...(profile?.skills ?? []), ...weights]),
    cvList: joinNorm([
      ...(cv?.skills.primary ?? []),
      ...(cv?.skills.secondary ?? []),
      ...(cv?.experience ?? []).flatMap((e) => e.tech ?? []),
      ...(cv?.projects ?? []).flatMap((p) => p.tech ?? []),
    ]),
    // An imported résumé/portfolio page (lib/profile/url-import.ts) counts
    // through the lines the user marked "Mine" only (below, with the CV's
    // bullets); its raw text and "learning" lines never feed suggestions.
    profileText: joinNorm([profile?.headline, profile?.summaryMd, profile?.careerNarrativeMd]),
    cvText: joinNorm([
      cv?.basics.headline,
      cv?.summary,
      ...(cv?.experience ?? []).flatMap((e) => [e.role, ...e.bullets]),
      ...(cv?.projects ?? []).flatMap((p) => [p.name, p.description, ...(p.highlights ?? [])]),
      ...(cv?.certifications ?? []).map((c) => c.name),
      ...(page?.experience ?? []),
      ...(page?.projects ?? []),
      ...(page?.metrics ?? []),
    ]),
    industries: joinNorm(profile?.industries ?? []),
  }
}

interface Evidence {
  profile: string[]
  cv: string[]
}

function evidence(c: Corpus, terms: readonly string[]): Evidence {
  const prose = terms.filter((t) => !LIST_ONLY.has(t))
  const uniq = (xs: string[]): string[] => [...new Set(xs)]
  return {
    profile: uniq([...findTerms(c.profileList, terms), ...findTerms(c.profileText, prose)]),
    cv: uniq([...findTerms(c.cvList, terms), ...findTerms(c.cvText, prose)]),
  }
}

/**
 * Master-CV evidence only. The master CV is derived from READY items
 * (interview-ready, or domain-ready in domain wording), so rules built on it
 * never fire from the profile's free-text skills or a not-ready item.
 */
function readyEvidence(c: Corpus, terms: readonly string[]): Evidence {
  const prose = terms.filter((t) => !LIST_ONLY.has(t))
  return { profile: [], cv: [...new Set([...findTerms(c.cvList, terms), ...findTerms(c.cvText, prose)])] }
}

const READY_NOTE = 'From interview-ready or domain-ready items in your master profile'
const SQL_TERMS = ['sql', 'postgresql', 'postgres', 'mysql', 'mariadb', 'sql server']
const ANALYSIS_TERMS = [
  'python', 'pandas', 'reporting', 'reports', 'statement exports', 'statement export', 'exports',
  'reconciliation', 'reconciliations', 'ledger', 'ledgers', 'dashboards', 'dashboard', 'excel',
  'power bi', 'tableau', 'looker', 'kpi', 'kpis', 'analytics',
]
const REQUIREMENTS_TERMS = [
  'requirements gathering', 'gathered requirements', 'gathering requirements', 'client requirements',
  'business requirements', 'requirements analysis', 'business module', 'business modules',
  'user stories', 'uat', 'user acceptance testing', 'process mapping', 'module tracing',
]
const BUSINESS_DOMAIN_TERMS = ['erp', 'e-invoicing', 'einvoicing', 'zatca', 'fatoora', 'odoo', 'netsuite', 'sap', 'invoicing', 'accounting']
const MODELLING_TERMS = ['dbt', 'data modelling', 'data modeling', 'dimensional modelling', 'dimensional modeling', 'star schema']

function count(e: Evidence): number {
  return new Set([...e.profile, ...e.cv]).size
}

function merge(...es: Evidence[]): Evidence {
  return {
    profile: [...new Set(es.flatMap((e) => e.profile))],
    cv: [...new Set(es.flatMap((e) => e.cv))],
  }
}

const DISPLAY: Readonly<Record<string, string>> = {
  php: 'PHP', laravel: 'Laravel', 'next.js': 'Next.js', nextjs: 'Next.js', typescript: 'TypeScript',
  javascript: 'JavaScript', react: 'React', angular: 'Angular', vue: 'Vue', mysql: 'MySQL',
  postgres: 'Postgres', postgresql: 'PostgreSQL', supabase: 'Supabase', docker: 'Docker',
  kubernetes: 'Kubernetes', aws: 'AWS', zatca: 'ZATCA', fatoora: 'Fatoora', vat: 'VAT', gst: 'GST',
  kyc: 'KYC', kyb: 'KYB', ach: 'ACH', quickbooks: 'QuickBooks', netsuite: 'NetSuite', plaid: 'Plaid',
  openai: 'OpenAI', openrouter: 'OpenRouter', llm: 'LLM', llms: 'LLMs', 'rest api': 'REST APIs',
  api: 'APIs', apis: 'APIs', xades: 'XAdES', en16931: 'EN16931', 'ci/cd': 'CI/CD', sql: 'SQL',
  'node.js': 'Node.js', node: 'Node.js', graphql: 'GraphQL', phpunit: 'PHPUnit',
  'power bi': 'Power BI', erp: 'ERP', uat: 'UAT', kpi: 'KPI', kpis: 'KPIs', dbt: 'dbt', sap: 'SAP',
}

function show(term: string): string {
  return DISPLAY[term] ?? term
}

function reasonLines(e: Evidence, extra: string[] = []): string[] {
  const lines: string[] = []
  if (e.profile.length > 0) lines.push(`Your profile lists ${e.profile.slice(0, 4).map(show).join(', ')}`)
  const cvOnly = e.cv.filter((t) => !e.profile.includes(t))
  if (cvOnly.length > 0) lines.push(`Your master CV shows ${cvOnly.slice(0, 4).map(show).join(', ')}`)
  return [...lines, ...extra]
}

const G = SKILL_GROUPS
const PHP_TERMS = ['php', 'laravel', 'symfony', 'codeigniter', 'yii', 'lumen', 'livewire']
const JS_FRONT = ['react', 'next.js', 'nextjs', 'angular', 'vue', 'vue.js', 'svelte', 'inertia']
const TS_TERMS = ['next.js', 'nextjs', 'typescript']
const TS_DATA = ['supabase', 'postgres', 'postgresql', 'prisma', 'drizzle']
const INFRA_CORE = ['docker', 'kubernetes', 'k8s', 'terraform', 'aws', 'gcp', 'google cloud', 'azure', 'helm']
const FINTECH_INDUSTRY = ['fintech', 'payments', 'banking', 'financial services', 'insurtech', 'lending']
const WEBHOOKS = ['webhooks', 'webhook', 'rest api', 'restful', 'third-party api', 'third party apis', 'partner apis', 'partner api', 'third-party integrations', 'oauth', 'sdk']

interface Rule {
  id: string
  family: string
  label: string
  priority: SuggestionPriority
  /** Evidence when the rule fires, else null. */
  test(c: Corpus): { e: Evidence; extra?: string[] } | null
}

function industryHit(c: Corpus, terms: readonly string[]): string[] {
  return findTerms(c.industries, terms)
}

const RULES: readonly Rule[] = [
  {
    id: 'backend_php', family: 'backend', label: 'Backend (PHP/Laravel)', priority: 'strong',
    test: (c) => { const e = evidence(c, PHP_TERMS); return count(e) > 0 ? { e: merge(e, evidence(c, ['mysql', 'postgresql', 'redis', 'rest api'])) } : null },
  },
  {
    id: 'backend', family: 'backend', label: 'Backend', priority: 'strong',
    test: (c) => { const e = evidence(c, G.backend.filter((t) => !PHP_TERMS.includes(t))); return count(evidence(c, PHP_TERMS)) === 0 && count(e) >= 2 ? { e } : null },
  },
  {
    // Multi-tenant SaaS engineering (tenancy, idempotency, audit trails, RLS).
    id: 'platform_backend', family: 'backend', label: 'Platform / Backend Engineer (multi-tenant SaaS)', priority: 'possible',
    test: (c) => { const e = evidence(c, G.platform); return count(e) >= 2 ? { e } : null },
  },
  {
    id: 'fullstack_laravel', family: 'fullstack', label: 'Full-stack (Laravel + React/Next.js/Angular)', priority: 'strong',
    test: (c) => { const p = evidence(c, PHP_TERMS); const f = evidence(c, JS_FRONT); return count(p) > 0 && count(f) > 0 ? { e: merge(p, f) } : null },
  },
  {
    id: 'fullstack_ts', family: 'fullstack', label: 'Full-stack TypeScript Developer', priority: 'possible',
    test: (c) => { const t = evidence(c, TS_TERMS); const d = evidence(c, TS_DATA); return count(t) > 0 && count(d) > 0 ? { e: merge(t, d) } : null },
  },
  {
    id: 'payments', family: 'payments', label: 'Payments / Fintech Backend Engineer', priority: 'strong',
    test: (c) => {
      const e = evidence(c, G.payments)
      const ind = industryHit(c, FINTECH_INDUSTRY)
      if (count(e) === 0 && ind.length === 0) return null
      if (count(evidence(c, G.backend)) === 0) return null
      return { e, extra: ind.length > 0 ? [`Industry: ${ind.join(', ')}`] : [] }
    },
  },
  {
    id: 'payments_integration', family: 'payments', label: 'Payments Integration Engineer', priority: 'possible',
    test: (c) => { const p = evidence(c, G.payments); const w = evidence(c, WEBHOOKS); return count(p) > 0 && count(w) > 0 ? { e: merge(p, w) } : null },
  },
  {
    id: 'api_integration', family: 'api_integration', label: 'API / Integrations Engineer', priority: 'possible',
    test: (c) => {
      const w = evidence(c, [...WEBHOOKS, ...G.integrations])
      return count(w) > 0 && count(evidence(c, G.backend)) > 0 ? { e: w } : null
    },
  },
  {
    id: 'einvoicing', family: 'einvoicing', label: 'E-invoicing / ZATCA Integration Developer', priority: 'strong',
    test: (c) => { const e = evidence(c, G.einvoicing); return count(e) > 0 ? { e, extra: ['High demand in KSA and UAE'] } : null },
  },
  {
    id: 'erp', family: 'erp', label: 'ERP Developer / ERP Integration Engineer', priority: 'possible',
    test: (c) => { const e = evidence(c, [...G.einvoicing, 'erp', 'odoo', 'erpnext', 'netsuite', 'sap', 'dynamics 365', 'quickbooks', 'xero', 'zoho books', 'tally']); return count(e) > 0 ? { e } : null },
  },
  {
    id: 'implementation', family: 'implementation', label: 'Implementation / Solutions Engineer (technical)', priority: 'possible',
    test: (c) => { const e = evidence(c, [...G.integrations, 'webhooks', 'webhook', 'partner apis', 'client onboarding', 'onboarding', 'implementation']); return count(e) >= 2 ? { e } : null },
  },
  {
    id: 'llm_app', family: 'llm_app', label: 'AI Application / LLM Integration Developer (junior)', priority: 'stretch',
    test: (c) => { const e = evidence(c, G.llm); return count(e) > 0 ? { e } : null },
  },
  {
    // Negative rule: no container/orchestration/cloud-infra evidence → never
    // suggest DevOps/SRE/Platform, however much CI or Linux the CV mentions.
    id: 'devops', family: 'devops', label: 'DevOps-leaning Backend', priority: 'possible',
    test: (c) => {
      const core = evidence(c, INFRA_CORE)
      const all = evidence(c, G.devops)
      return count(core) > 0 && count(all) >= 2 && count(evidence(c, G.backend)) > 0 ? { e: all } : null
    },
  },
  {
    id: 'qa_automation', family: 'qa_automation', label: 'QA Automation', priority: 'possible',
    test: (c) => { const e = evidence(c, G.qa); return count(e) >= 2 ? { e } : null },
  },
  {
    id: 'frontend', family: 'frontend', label: 'Frontend', priority: 'possible',
    test: (c) => { const e = evidence(c, G.frontend); return count(e) >= 3 && count(evidence(c, G.backend)) === 0 ? { e } : null },
  },
  ...(['mobile', 'data', 'ml'] as const).map((id): Rule => ({
    id, family: id, label: roleFamilyLabel(id), priority: 'possible',
    test: (c) => { const fam = ROLE_FAMILIES.find((f) => f.id === id)!; const e = evidence(c, fam.skills); return count(e) >= 2 ? { e } : null },
  })),
  {
    // Data / analysis, from READY evidence only: SQL plus Python, reporting,
    // statement exports, reconciliation or ledger work.
    id: 'data_analyst', family: 'data_analyst', label: 'Data Analyst / BI (junior)', priority: 'possible',
    test: (c) => {
      const q = readyEvidence(c, SQL_TERMS)
      const a = readyEvidence(c, ANALYSIS_TERMS)
      return count(q) > 0 && count(a) > 0 ? { e: merge(q, a), extra: [READY_NOTE] } : null
    },
  },
  {
    // Requirements work with clients plus business modules or the ERP /
    // e-invoicing domain, from READY evidence only.
    id: 'business_analyst', family: 'business_analyst', label: 'Business / Systems Analyst (ERP, finance systems)', priority: 'possible',
    test: (c) => {
      const r = readyEvidence(c, REQUIREMENTS_TERMS)
      const d = readyEvidence(c, BUSINESS_DOMAIN_TERMS)
      return count(r) > 0 && count(d) > 0 ? { e: merge(r, d), extra: [READY_NOTE] } : null
    },
  },
  {
    id: 'analytics_eng', family: 'analytics_eng', label: 'Analytics Engineer (SQL modelling)', priority: 'stretch',
    test: (c) => {
      const m = readyEvidence(c, MODELLING_TERMS)
      const q = readyEvidence(c, SQL_TERMS)
      return count(m) > 0 && count(q) > 0 ? { e: merge(m, q), extra: [READY_NOTE] } : null
    },
  },
  {
    id: 'support_eng', family: 'support_eng', label: 'Application / Production Support Engineer (L2/L3)', priority: 'fallback',
    test: (c) => { const e = evidence(c, G.support); return count(e) > 0 && count(evidence(c, G.backend)) > 0 ? { e } : null },
  },
]

const PRIORITY_ORDER: readonly SuggestionPriority[] = ['strong', 'possible', 'stretch', 'fallback']

/** Minimum combined evidence (skills + CV entries) below which we call the profile sparse. */
const SPARSE_BELOW = 3

export function suggestRoles(input: SuggestionInput): SuggestionResult {
  const { profile, masterCv } = input
  const corpus = buildCorpus(input)
  const targeted = new Set(
    (profile?.roleTypes ?? []).map((r) => resolveRoleFamily(r)).filter((f): f is string => f !== null),
  )
  const dismissed = new Set(profile?.dismissedRoleSuggestions ?? [])
  const years = profile?.yearsExperience
  const yearsNote = typeof years === 'number' && years > 0 ? [`${years} yr${years === 1 ? '' : 's'} experience in your profile`] : []
  const suggestions: RoleSuggestion[] = []
  for (const rule of RULES) {
    if (targeted.has(rule.family) || dismissed.has(rule.id)) continue
    const hit = rule.test(corpus)
    if (!hit) continue
    const extra = [...(hit.extra ?? []), ...(rule.priority === 'strong' ? yearsNote : [])]
    suggestions.push({
      id: rule.id,
      family: rule.family,
      label: rule.label,
      reasons: reasonLines(hit.e, extra),
      priority: rule.priority,
      source: 'rules',
    })
  }
  suggestions.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
  const page = readLinkedProfile(profile?.linkedProfile)
  const signals =
    (profile?.skills?.length ?? 0) +
    (masterCv?.experience.length ?? 0) +
    (masterCv?.skills.primary.length ?? 0) +
    (page?.experience.length ?? 0)
  return {
    suggestions,
    sparse: signals < SPARSE_BELOW,
    hasProfile: profile !== null,
    hasMasterCv: masterCv !== null,
  }
}

/** Compact, CV-grounded digest of the profile for AI prompts (no contact details). */
export function profileDigest(input: SuggestionInput, maxChars = 3_000): string {
  const { profile, masterCv } = input
  const lines: string[] = []
  if (profile?.headline) lines.push(`Headline: ${profile.headline}`)
  if (profile?.yearsExperience != null) lines.push(`Years of experience: ${profile.yearsExperience}`)
  if (profile?.skills?.length) lines.push(`Profile skills: ${profile.skills.join(', ')}`)
  if (profile?.industries?.length) lines.push(`Industries: ${profile.industries.join(', ')}`)
  if (profile?.summaryMd) lines.push(`Summary: ${profile.summaryMd}`)
  const page = readLinkedProfile(profile?.linkedProfile)
  if (page) {
    for (const e of page.experience.slice(0, 6)) lines.push(`Page experience: ${e}`)
    for (const p of page.projects.slice(0, 4)) lines.push(`Page project: ${p}`)
    for (const m of page.metrics.slice(0, 4)) lines.push(`Page result: ${m}`)
  }
  if (masterCv) {
    if (masterCv.skills.primary.length) lines.push(`CV skills: ${masterCv.skills.primary.join(', ')}`)
    for (const e of masterCv.experience.slice(0, 5)) {
      lines.push(`CV role: ${e.role} (${e.start}–${e.end})${e.tech?.length ? ` [${e.tech.join(', ')}]` : ''}`)
      for (const b of e.bullets.slice(0, 4)) lines.push(`  - ${b}`)
    }
    for (const p of (masterCv.projects ?? []).slice(0, 4)) {
      lines.push(`CV project: ${p.name}${p.tech?.length ? ` [${p.tech.join(', ')}]` : ''} ${p.description}`)
    }
  }
  const text = lines.join('\n')
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}
