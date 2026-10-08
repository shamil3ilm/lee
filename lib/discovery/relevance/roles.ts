import { findTerms, normalizeForMatch, termMatcher, type TermMatcher } from './text'

/**
 * Role families: what a posting's TITLE says the job is. Each family lists
 * title synonyms; `skills` are the stack/domain words that point at the
 * family when they appear in a CV or in a generic posting's description.
 */
export interface RoleFamily {
  id: string
  label: string
  /** Title phrases (normalized matching, word-bounded). */
  titles: readonly string[]
  /** Skill / domain evidence for the family. */
  skills: readonly string[]
}

const BACKEND_SKILLS = [
  'php', 'laravel', 'symfony', 'codeigniter', 'yii', 'node', 'node.js', 'nodejs', 'express',
  'nestjs', 'java', 'spring', 'spring boot', 'golang', 'go', 'python', 'django', 'flask',
  'fastapi', 'ruby', 'rails', 'ruby on rails', '.net', 'dotnet', 'c#', 'asp.net', 'elixir',
  'phoenix', 'scala', 'rust', 'kotlin', 'mysql', 'postgres', 'postgresql', 'mariadb',
  'mongodb', 'redis', 'rabbitmq', 'kafka', 'sqs', 'microservices', 'rest api', 'restful',
  'graphql', 'grpc', 'backend', 'back-end', 'server-side', 'sql', 'orm', 'eloquent',
]
/**
 * Platform / backend domain terms (multi-tenant SaaS engineering). They
 * count as backend evidence and drive the platform-backend suggestion.
 */
const PLATFORM_SKILLS = [
  'multi-tenancy', 'multi-tenant', 'multitenancy', 'idempotency', 'idempotent', 'audit trail',
  'audit trails', 'audit logging', 'audit log', 'row-level security', 'row level security', 'rls',
  'rate limiting', 'background jobs', 'job queues', 'event sourcing', 'feature flags',
]
const FRONTEND_SKILLS = [
  'react', 'react.js', 'reactjs', 'next.js', 'nextjs', 'vue', 'vue.js', 'vuejs', 'nuxt',
  'angular', 'svelte', 'javascript', 'typescript', 'html', 'css', 'tailwind', 'sass',
  'jquery', 'redux', 'livewire', 'inertia', 'alpine.js', 'frontend', 'front-end',
]
const DEVOPS_SKILLS = [
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'ci/cd', 'ci cd', 'github actions',
  'gitlab ci', 'jenkins', 'aws', 'gcp', 'google cloud', 'azure', 'linux', 'nginx', 'helm',
  'prometheus', 'grafana', 'devops', 'serverless', 'lambda', 'ec2', 'cloudflare', 'vercel',
]
const API_SKILLS = [
  'rest api', 'restful', 'api', 'apis', 'webhooks', 'webhook', 'integrations', 'integration',
  'third-party api', 'third party apis', 'oauth', 'soap', 'graphql', 'openapi', 'swagger',
  'postman', 'api design', 'sdk', 'middleware', 'zapier', 'partner apis', 'third-party integrations',
  'idempotency', 'idempotent', 'idempotency keys', 'webhook signatures', 'webhook retries',
]
const PAYMENTS_SKILLS = [
  'payments', 'payment', 'payment gateway', 'payment gateways', 'stripe', 'paypal', 'adyen',
  'checkout.com', 'braintree', 'razorpay', 'paytabs', 'telr', 'fintech', 'banking', 'pci',
  'pci dss', 'ach', 'plaid', 'open banking', 'e-check', 'echeck', 'cheque', 'invoicing',
  'billing', 'ledger', 'reconciliation', 'wallet', 'wallets', 'remittance', 'card issuing', 'kyc',
  'kyb', 'aml', 'payouts', 'payment approvals', 'approval workflows', 'cheques', 'check printing',
  'e-checks', 'acquiring', 'positive pay', 'ach payments', 'ach transfers', 'nacha', 'remote deposit',
  'bank reconciliation', 'payment orchestration',
]
const EINVOICING_SKILLS = [
  'zatca', 'fatoora', 'e-invoicing', 'einvoicing', 'e-invoice', 'electronic invoicing',
  'fta e-invoicing', 'vat', 'gst', 'e-way bill', 'en16931', 'en 16931', 'xades', 'ubl',
  'peppol', 'tax compliance', 'tax invoice', 'qr code invoice', 'clearance model',
]
const LLM_SKILLS = [
  'llm', 'llms', 'openai', 'openai api', 'openrouter', 'anthropic', 'claude api', 'gemini api',
  'langchain', 'rag', 'embeddings', 'vector database', 'prompt engineering', 'token tracking',
  'cost tracking', 'llm observability', 'ai integration', 'function calling', 'groq',
]
const INTEGRATION_PLATFORMS = [
  'quickbooks', 'netsuite', 'xero', 'plaid', 'salesforce', 'hubspot', 'shopify api', 'zoho',
  'partner apis', 'partner api', 'third-party integrations', 'third party integrations',
]
const QA_SKILLS = [
  'phpunit', 'pest', 'jest', 'vitest', 'mocha', 'cypress', 'playwright', 'selenium',
  'test automation', 'automated testing', 'tdd', 'unit testing', 'integration testing',
  'e2e', 'qa', 'quality assurance', 'appium', 'postman tests',
]
/** Data analysis / BI: querying, reporting and dashboards. */
const DATA_ANALYST_SKILLS = [
  'sql', 'postgresql', 'postgres', 'mysql', 'python', 'pandas', 'numpy', 'excel', 'advanced excel',
  'power bi', 'powerbi', 'tableau', 'looker', 'looker studio', 'metabase', 'superset', 'dashboards',
  'dashboard', 'reporting', 'reports', 'kpi', 'kpis', 'data analysis', 'data visualization',
  'data visualisation', 'statistics', 'statement exports', 'reconciliation', 'ledger', 'mis reports',
]
/** Business / systems analysis: requirements and process work, often ERP or finance systems. */
const BUSINESS_ANALYST_SKILLS = [
  'requirements gathering', 'requirements analysis', 'business requirements', 'brd', 'frd',
  'functional specifications', 'functional specification', 'user stories', 'acceptance criteria',
  'uat', 'user acceptance testing', 'process mapping', 'process modelling', 'process modeling',
  'bpmn', 'gap analysis', 'stakeholder management', 'business module', 'business modules',
  'erp', 'e-invoicing', 'zatca', 'oracle ebs', 'oracle fusion', 'sap',
]
/** Analytics engineering: SQL modelling in the warehouse. */
const ANALYTICS_ENG_SKILLS = [
  'dbt', 'data modelling', 'data modeling', 'dimensional modelling', 'dimensional modeling',
  'star schema', 'sql', 'snowflake', 'bigquery', 'redshift', 'data warehouse', 'elt', 'etl',
]
const SUPPORT_SKILLS = [
  'troubleshooting', 'debugging', 'production support', 'incident', 'incidents', 'on-call',
  'root cause', 'rca', 'customer support', 'customer issues', 'l2', 'l3', 'ticketing',
  'zendesk', 'jira service', 'freshdesk', 'sla', 'log analysis',
]
const CLIENT_SKILLS = [
  'client-facing', 'customer-facing', 'clients', 'customers', 'stakeholders', 'stakeholder',
  'onboarding', 'client onboarding', 'implementation', 'implementations', 'rollout',
  'demos', 'pre-sales', 'presales', 'requirements gathering', 'consulting', 'training',
]

export const ROLE_FAMILIES: readonly RoleFamily[] = [
  {
    id: 'backend',
    label: 'Backend',
    titles: [
      'backend', 'back end', 'back-end', 'server side', 'server-side', 'api developer',
      'php developer', 'php engineer', 'laravel developer', 'laravel engineer', 'symfony developer',
      'node developer', 'node.js developer', 'nodejs developer', 'node engineer', 'java developer',
      'java engineer', 'golang developer', 'golang engineer', 'go developer', 'go engineer',
      'python developer', 'python engineer', 'django developer', 'ruby developer',
      'rails developer', 'ruby on rails', '.net developer', '.net engineer', 'dotnet developer',
      'c# developer', 'elixir developer', 'scala developer', 'rust developer', 'rust engineer',
      'kotlin developer', 'php', 'laravel', 'golang', 'php laravel developer', 'laravel php developer',
      'blockchain developer', 'smart contract developer', 'solidity developer',
      'salesforce developer',
    ],
    skills: [...BACKEND_SKILLS, ...PLATFORM_SKILLS],
  },
  {
    id: 'fullstack',
    label: 'Full-stack',
    titles: [
      'full stack', 'full-stack', 'fullstack', 'mern', 'mean stack', 'lamp', 'web developer',
      'web engineer', 'web application developer', 'wordpress developer', 'magento developer',
      'drupal developer', 'desarrollador full stack',
    ],
    skills: [...BACKEND_SKILLS, ...FRONTEND_SKILLS],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    titles: [
      'frontend', 'front end', 'front-end', 'ui developer', 'ui engineer', 'react developer',
      'react engineer', 'vue developer', 'angular developer', 'javascript developer',
      'javascript engineer', 'typescript developer', 'shopify developer', 'webflow developer',
      'design engineer',
    ],
    skills: FRONTEND_SKILLS,
  },
  {
    id: 'api_integration',
    label: 'API / Integration Engineer',
    titles: [
      'integration engineer', 'integrations engineer', 'integration developer',
      'integrations developer', 'api engineer', 'api integration', 'integration specialist',
      'middleware developer', 'edi developer',
    ],
    skills: [...API_SKILLS, ...INTEGRATION_PLATFORMS],
  },
  {
    id: 'payments',
    label: 'Payments / Fintech Backend Engineer',
    titles: [
      'payments engineer', 'payment engineer', 'payments developer', 'payment developer',
      'payments integration', 'payment integration', 'fintech engineer', 'fintech developer',
      'fintech backend', 'billing engineer', 'wallet developer',
    ],
    skills: PAYMENTS_SKILLS,
  },
  {
    id: 'einvoicing',
    label: 'E-invoicing / ZATCA Integration Developer',
    titles: [
      'e-invoicing', 'einvoicing', 'e invoicing', 'e-invoice', 'electronic invoicing', 'zatca',
      'fatoora', 'tax integration', 'tax technology', 'invoicing integration',
    ],
    skills: EINVOICING_SKILLS,
  },
  {
    id: 'erp',
    label: 'ERP Developer / ERP Integration Engineer',
    titles: [
      'erp developer', 'erp engineer', 'erp integration', 'erp consultant', 'erp technical',
      'odoo developer', 'odoo', 'erpnext', 'netsuite developer', 'sap abap', 'abap developer',
      'dynamics 365 developer', 'd365 developer', 'oracle erp developer',
    ],
    skills: ['erp', 'odoo', 'erpnext', 'netsuite', 'sap', 'dynamics 365', 'quickbooks', 'xero', 'tally', 'zoho books', ...EINVOICING_SKILLS],
  },
  {
    id: 'devops',
    label: 'DevOps-leaning Backend / Platform',
    titles: [
      'devops', 'dev ops', 'sre', 'site reliability', 'platform engineer', 'infrastructure engineer',
      'cloud engineer', 'kubernetes engineer', 'build engineer', 'release engineer',
      'operations engineer', 'ops engineer', 'systems engineer', 'mlops',
    ],
    skills: DEVOPS_SKILLS,
  },
  {
    id: 'mobile',
    label: 'Mobile',
    titles: ['mobile', 'ios', 'android', 'flutter', 'react native', 'swift developer', 'kotlin android'],
    skills: ['flutter', 'dart', 'react native', 'swift', 'swiftui', 'kotlin', 'android', 'ios', 'xamarin'],
  },
  {
    id: 'data_analyst',
    label: 'Data Analyst / BI',
    titles: [
      'data analyst', 'data analytics', 'bi analyst', 'bi developer', 'business intelligence',
      'reporting analyst', 'reporting specialist', 'mis executive', 'mis analyst', 'mis specialist',
      'mis officer', 'insights analyst', 'power bi developer', 'power bi analyst', 'tableau developer',
      'dashboard developer', 'analytics analyst', 'product analyst', 'operations analyst',
    ],
    skills: DATA_ANALYST_SKILLS,
  },
  {
    id: 'business_analyst',
    label: 'Business / Systems Analyst',
    titles: [
      'business analyst', 'systems analyst', 'system analyst', 'business systems analyst',
      'it business analyst', 'technical business analyst', 'erp analyst', 'functional analyst',
      'functional consultant', 'oracle functional', 'sap functional', 'requirements analyst',
      'process analyst', 'business process analyst',
    ],
    skills: BUSINESS_ANALYST_SKILLS,
  },
  {
    id: 'analytics_eng',
    label: 'Analytics Engineer',
    titles: ['analytics engineer', 'data modeler', 'data modeller', 'dbt developer'],
    skills: ANALYTICS_ENG_SKILLS,
  },
  {
    id: 'data',
    label: 'Data Engineering / ETL',
    titles: ['data engineer', 'etl developer', 'etl engineer', 'data platform', 'big data', 'data pipeline engineer'],
    skills: ['etl', 'airflow', 'spark', 'dbt', 'snowflake', 'bigquery', 'redshift', 'databricks', 'data pipeline', 'data pipelines', 'data warehouse', 'kafka streams'],
  },
  {
    id: 'ml',
    label: 'ML Engineering',
    titles: ['machine learning', 'ml engineer', 'deep learning', 'applied scientist', 'nlp engineer', 'computer vision', 'data scientist'],
    skills: ['machine learning', 'pytorch', 'tensorflow', 'scikit-learn', 'hugging face', 'model training', 'deep learning'],
  },
  {
    id: 'llm_app',
    label: 'AI Application / LLM Integration Developer',
    titles: [
      'ai engineer', 'ai agent engineer', 'ai agents engineer', 'llm engineer', 'ai developer',
      'ai application developer', 'ai integration', 'llm integration', 'genai developer',
      'generative ai developer', 'generative ai engineer', 'ai software engineer',
    ],
    skills: LLM_SKILLS,
  },
  {
    id: 'qa_automation',
    label: 'QA Automation',
    titles: ['qa automation', 'qa engineer', 'qa tester', 'qa analyst', 'sdet', 'test automation', 'automation tester', 'automation engineer', 'quality assurance engineer', 'software tester', 'test engineer', 'software test'],
    skills: QA_SKILLS,
  },
  {
    id: 'solutions',
    label: 'Solutions Engineer',
    titles: ['solutions engineer', 'solution engineer', 'solutions consultant', 'solutions architect', 'solution architect', 'sales engineer', 'pre-sales engineer', 'presales engineer', 'customer engineer', 'forward deployed engineer', 'technical account manager', 'technical consultant'],
    skills: [...API_SKILLS, ...CLIENT_SKILLS],
  },
  {
    id: 'support_eng',
    label: 'Application / Production Support Engineer (L2/L3)',
    titles: ['support engineer', 'technical support', 'application support', 'production support', 'product support engineer', 'l2 support', 'l3 support', 'escalation engineer', 'customer reliability engineer', 'technical support engineer'],
    skills: SUPPORT_SKILLS,
  },
  {
    id: 'implementation',
    label: 'Implementation / Solutions Engineer (technical)',
    titles: ['implementation engineer', 'implementation consultant', 'implementation specialist', 'implementation analyst', 'implementation manager', 'onboarding engineer', 'deployment engineer', 'integration consultant', 'professional services engineer'],
    skills: [...API_SKILLS, ...CLIENT_SKILLS],
  },
  {
    id: 'security',
    label: 'Security Engineering',
    titles: ['security engineer', 'appsec', 'application security', 'devsecops', 'penetration tester', 'pentester', 'security analyst'],
    skills: ['owasp', 'pentest', 'penetration testing', 'iam', 'soc 2', 'soc2', 'siem', 'vulnerability'],
  },
]

export const ROLE_FAMILY_IDS: readonly string[] = ROLE_FAMILIES.map((f) => f.id)
const BY_ID = new Map(ROLE_FAMILIES.map((f) => [f.id, f] as const))

export function roleFamily(id: string): RoleFamily | undefined {
  return BY_ID.get(id)
}

export function roleFamilyLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id
}

const TITLE_MATCHERS: ReadonlyArray<{ id: string; match: TermMatcher }> = ROLE_FAMILIES.map((f) => ({
  id: f.id,
  match: termMatcher(f.titles),
}))

/** Generic software titles: engineering, family unknown from the title. */
const GENERIC_SOFTWARE = termMatcher([
  'software engineer', 'software developer', 'software development engineer', 'application developer',
  'applications developer', 'app developer', 'programmer', 'developer', 'coder', 'sde', 'swe',
  'member of technical staff', 'engineer', 'desarrollador', 'programador', 'ingeniero de software',
  'desenvolvedor', 'entwickler', 'développeur', 'tech lead', 'technical lead', 'engineering',
])

/** "Engineer" titles that are not software jobs. */
const NON_SOFTWARE_ENGINEERING = termMatcher([
  'mechanical', 'civil', 'electrical', 'structural', 'chemical', 'process engineer', 'mining',
  'drilling', 'hvac', 'mep', 'estimator', 'site engineer', 'field engineer', 'maintenance',
  'manufacturing', 'biomedical', 'petroleum', 'environmental', 'audio engineer', 'sound engineer',
  'recording engineer', 'quality engineer', 'piping', 'geotechnical', 'surveyor', 'aerospace',
  'automotive', 'marine', 'nuclear', 'hardware engineer', 'rf engineer', 'network engineer',
  'sales engineer at', 'prompt engineer', 'bms', 'technician',
])

/** Titles that are clearly not engineering, even with a stray tech word. */
const NON_ENGINEERING_TITLE = termMatcher([
  'product manager', 'project manager', 'program manager', 'account executive', 'account manager',
  'sales', 'marketing', 'recruiter', 'talent', 'hr', 'human resources', 'people operations',
  'payroll', 'accountant', 'bookkeeper', 'finance manager', 'customer success', 'customer service',
  'customer support specialist', 'support specialist', 'designer', 'copywriter', 'writer',
  'content', 'social media', 'paralegal', 'lawyer', 'legal', 'nurse', 'teacher', 'tutor',
  'coach', 'annotator', 'data entry', 'virtual assistant', 'assistant', 'coordinator',
  'driver', 'gardener', 'handyman', 'mechanic', 'mecánico', 'cashier', 'chef', 'cook',
  'voice over', 'translator', 'trainer', 'evaluator', 'analyst', 'business development',
  'bidder', 'clinical', 'medical', 'officer', 'operations specialist', 'scheduler',
])

export interface RoleClassification {
  /** Families named by the title (or inferred for a generic software title). */
  families: string[]
  /** True when the posting is a software/tech engineering job at all. */
  engineering: boolean
  /** True when the title was generic ("Software Engineer") and families were inferred. */
  generic: boolean
}

function familiesFromTitle(title: string): string[] {
  return TITLE_MATCHERS.filter((m) => m.match(title) !== null).map((m) => m.id)
}

/**
 * Infer families for a generic software title from its tags and the start
 * of its description: backend and frontend evidence together → full-stack.
 */
function inferFamilies(evidence: string): string[] {
  const backend = findTerms(evidence, BACKEND_SKILLS).length
  const frontend = findTerms(evidence, FRONTEND_SKILLS).length
  const out: string[] = []
  if (backend > 0) out.push('backend')
  if (backend > 0 && frontend > 0) out.push('fullstack')
  if (frontend > 0 && backend === 0) out.push('frontend')
  if (findTerms(evidence, DEVOPS_SKILLS).length >= 2) out.push('devops')
  return out
}

/**
 * Families a job description reads as, from its stack and asks (not the
 * title): backend / full-stack / frontend / DevOps as above, plus data
 * analysis and business analysis when the JD names two of their skills.
 */
export function familiesFromEvidence(normalizedText: string): string[] {
  const out = inferFamilies(normalizedText)
  if (findTerms(normalizedText, DATA_ANALYST_SKILLS.filter((t) => !BACKEND_SKILLS.includes(t))).length >= 2) out.push('data_analyst')
  if (findTerms(normalizedText, BUSINESS_ANALYST_SKILLS).length >= 2) out.push('business_analyst')
  return out
}

/** Distinct software skills named in a description: strong JD evidence for an odd title. */
const STRONG_JD_EVIDENCE = 3

export function classifyRole(input: {
  title: string
  description?: string | null
  techStack?: readonly string[] | null
}): RoleClassification {
  const title = normalizeForMatch(input.title)
  const named = familiesFromTitle(title)
  const nonSoftware = NON_SOFTWARE_ENGINEERING(title) !== null
  if (named.length > 0 && !nonSoftware) return { families: named, engineering: true, generic: false }
  if (NON_ENGINEERING_TITLE(title) !== null || nonSoftware) {
    return { families: [], engineering: false, generic: false }
  }
  const evidence = normalizeForMatch(
    [(input.techStack ?? []).join(' '), (input.description ?? '').slice(0, 2_000)].join(' '),
  )
  if (GENERIC_SOFTWARE(title) === null) {
    // An unusual title ("Ninja", "Product Builder") is judged by its JD: a
    // description naming several software skills makes it a tech role.
    const hits = new Set([...findTerms(evidence, BACKEND_SKILLS), ...findTerms(evidence, FRONTEND_SKILLS)]).size
    if (hits < STRONG_JD_EVIDENCE) return { families: [], engineering: false, generic: false }
  }
  return { families: inferFamilies(evidence), engineering: true, generic: true }
}

/**
 * Resolve a free-text role (an older profile's "Backend Engineer", an
 * imported "Laravel Developer") to a family id; null when nothing matches.
 */
export function resolveRoleFamily(text: string): string | null {
  const t = text.trim()
  if (BY_ID.has(t)) return t
  const n = normalizeForMatch(t)
  const byLabel = ROLE_FAMILIES.find((f) => normalizeForMatch(f.label) === n)
  if (byLabel) return byLabel.id
  return familiesFromTitle(n)[0] ?? null
}

export const SKILL_GROUPS = {
  backend: BACKEND_SKILLS,
  frontend: FRONTEND_SKILLS,
  devops: DEVOPS_SKILLS,
  api: API_SKILLS,
  payments: PAYMENTS_SKILLS,
  qa: QA_SKILLS,
  support: SUPPORT_SKILLS,
  client: CLIENT_SKILLS,
  platform: PLATFORM_SKILLS,
  einvoicing: EINVOICING_SKILLS,
  llm: LLM_SKILLS,
  dataAnalyst: DATA_ANALYST_SKILLS,
  businessAnalyst: BUSINESS_ANALYST_SKILLS,
  analyticsEng: ANALYTICS_ENG_SKILLS,
  integrations: INTEGRATION_PLATFORMS,
} as const
