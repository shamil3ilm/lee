/**
 * Industry tags for companies: a small fixed vocabulary that the filters,
 * the fit ranking and the "Reach out" draft share. Client-safe, pure.
 */

export const INDUSTRIES = [
  'payments',
  'fintech',
  'banking',
  'einvoicing',
  'erp',
  'saas',
  'software',
  'it_services',
  'ecommerce',
  'data',
  'telecom',
] as const
export type Industry = (typeof INDUSTRIES)[number]

export const INDUSTRY_LABELS: Readonly<Record<Industry, string>> = {
  payments: 'Payments',
  fintech: 'Fintech',
  banking: 'Banking',
  einvoicing: 'E-invoicing',
  erp: 'ERP',
  saas: 'SaaS',
  software: 'Software',
  it_services: 'IT services',
  ecommerce: 'E-commerce',
  data: 'Data & AI',
  telecom: 'Telecom',
}

export function isIndustry(v: unknown): v is Industry {
  return typeof v === 'string' && (INDUSTRIES as readonly string[]).includes(v)
}

/**
 * Wikidata "industry" (P452) items the company query asks for, with the tag
 * each maps to. Checked 2026-10-09 against the industries of companies
 * headquartered in the target cities.
 */
export const WIKIDATA_INDUSTRIES: Readonly<Record<string, Industry>> = {
  Q880371: 'software', // software industry
  Q638608: 'software', // software development
  Q7397: 'software', // software
  Q11661: 'it_services', // information technology
  Q1481411: 'it_services', // IT service management
  Q1540863: 'it_services', // information technology consulting
  Q483639: 'it_services', // cloud computing
  Q3510521: 'it_services', // computer security
  Q75: 'it_services', // Internet
  Q1254596: 'saas', // software as a service
  Q16319025: 'fintech', // fintech
  Q837171: 'banking', // financial services
  Q57774188: 'banking', // financial sector
  Q22687: 'banking', // bank
  Q3435731: 'banking', // banking
  Q806718: 'banking', // economics of banking
  Q1365703: 'payments', // mobile payment
  Q188506: 'banking', // online banking
  Q986008: 'payments', // payment system
  Q1956140: 'payments', // payment service provider
  Q3323516: 'payments', // electronic payment
  Q484847: 'ecommerce', // e-commerce
  Q11660: 'data', // artificial intelligence
  Q858810: 'data', // big data
  Q2374463: 'data', // data science
  Q1988917: 'data', // data analysis
  Q131508: 'erp', // enterprise resource planning
  Q2401742: 'telecom', // telecommunications industry
  Q418: 'telecom', // telecommunications
}

/** Words in a description, YC industry or GitHub bio that imply a tag. */
const TEXT_RULES: ReadonlyArray<readonly [Industry, RegExp]> = [
  ['payments', /\b(payments?|payment gateway|acquiring|wallets?|remittance|payouts?|checkout|card issuing|bnpl|buy now,? pay later)\b/i],
  ['einvoicing', /\b(e-?invoic\w*|zatca|fatoora|peppol)\b/i],
  ['erp', /\b(erp|enterprise resource planning|odoo|accounting software|inventory management)\b/i],
  ['fintech', /\b(fintech|financial technology|neobank|open banking|insurtech|wealthtech|regtech|lending|credit)\b/i],
  ['banking', /\b(bank|banking|islamic finance)\b/i],
  ['saas', /\b(saas|software as a service|b2b software|platform for (?:businesses|smes|merchants))\b/i],
  ['data', /\b(data|analytics|machine learning|artificial intelligence|\bai\b|llm|computer vision)\b/i],
  ['ecommerce', /\b(e-?commerce|marketplace|online store|retail tech|quick commerce|delivery app)\b/i],
  ['it_services', /\b(it services|consult\w*|software house|digital agency|outsourc\w*|system integrat\w*|cloud|cyber ?security|devops)\b/i],
  ['software', /\b(software|developer tools?|apps?|platform|api)\b/i],
  ['telecom', /\b(telecom\w*|mobile operator|5g)\b/i],
]

/** Tags implied by free text, in vocabulary order. */
export function industriesFromText(text: string | null | undefined): Industry[] {
  const t = (text ?? '').slice(0, 2_000)
  if (!t.trim()) return []
  const hit = new Set(TEXT_RULES.filter(([, re]) => re.test(t)).map(([tag]) => tag))
  return INDUSTRIES.filter((i) => hit.has(i))
}

/** YC industry / subindustry / tags → our tags. */
export function industriesFromYc(parts: readonly string[]): Industry[] {
  return industriesFromText(parts.join(' · ').replace(/->/g, ' '))
}

/**
 * Which role families an industry speaks to (lib/discovery/relevance/roles
 * ids): the fit ranking matches these against the user's target families.
 */
export const INDUSTRY_FAMILIES: Readonly<Record<Industry, readonly string[]>> = {
  payments: ['payments', 'backend', 'api_integration'],
  fintech: ['payments', 'backend', 'fullstack', 'data_analyst'],
  // Banks, telecoms and retailers run large data, BI, ERP and analyst teams, not only engineering.
  banking: ['payments', 'backend', 'data_analyst', 'business_analyst', 'erp', 'analytics_eng'],
  einvoicing: ['einvoicing', 'erp', 'backend'],
  erp: ['erp', 'einvoicing', 'implementation', 'business_analyst'],
  saas: ['backend', 'fullstack', 'frontend', 'api_integration'],
  software: ['backend', 'fullstack', 'frontend', 'mobile', 'devops'],
  it_services: ['backend', 'fullstack', 'implementation', 'solutions'],
  ecommerce: ['backend', 'fullstack', 'payments', 'data_analyst', 'analytics_eng'],
  data: ['data', 'data_analyst', 'analytics_eng', 'ml', 'llm_app', 'business_analyst'],
  telecom: ['backend', 'devops', 'data_analyst', 'business_analyst', 'data'],
}

/** Union in vocabulary order. */
export function mergeIndustries(...lists: ReadonlyArray<readonly string[]>): Industry[] {
  const set = new Set(lists.flat())
  return INDUSTRIES.filter((i) => set.has(i))
}
