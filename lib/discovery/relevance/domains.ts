import { findTerms, normalizeForMatch, termMatcher } from './text'

/**
 * Non-tech domains a posting can positively belong to, from its TITLE and
 * its JD (duties, tools). Used by the domain rule: a posting is filtered
 * only on positive evidence of one of these AND little overlap with the
 * user's ready skills; never because a title is merely unknown.
 *
 * Tech titles inside these domains stay tech: "Marketing Technology
 * Engineer", "HRIS Developer", "Fintech Backend Engineer", "Legal-tech
 * Developer" (TECH_TITLE wins over every domain).
 */

export interface DomainDef {
  id: string
  label: string
  /** Title words that put a posting in the domain. */
  titles: readonly string[]
  /** JD duties / tools of the domain. */
  duties: readonly string[]
}

export const DOMAINS: readonly DomainDef[] = [
  {
    id: 'marketing',
    label: 'Marketing',
    titles: ['marketing', 'brand manager', 'social media', 'content writer', 'copywriter', 'seo specialist', 'growth marketer', 'community manager', 'public relations', 'pr manager', 'media buyer'],
    duties: ['campaign management', 'marketing campaigns', 'brand awareness', 'social media calendar', 'media buying', 'lead nurturing', 'influencer', 'content calendar', 'press releases', 'seo and sem', 'google ads campaigns'],
  },
  {
    id: 'hr',
    label: 'HR',
    titles: ['hr', 'human resources', 'recruiter', 'talent acquisition', 'people partner', 'hr generalist', 'hrbp', 'payroll', 'compensation and benefits', 'people operations', 'talent operations'],
    duties: ['recruitment', 'end-to-end recruitment', 'sourcing candidates', 'onboarding new hires', 'employee relations', 'performance appraisals', 'payroll processing', 'manpower planning', 'emiratisation targets', 'saudization targets'],
  },
  {
    id: 'legal',
    label: 'Legal',
    titles: ['legal counsel', 'lawyer', 'paralegal', 'attorney', 'advocate', 'legal advisor', 'compliance officer', 'company secretary'],
    duties: ['litigation', 'drafting contracts', 'contract negotiation', 'legal advice', 'court proceedings', 'regulatory filings', 'legal opinions'],
  },
  {
    id: 'sales',
    label: 'Sales',
    titles: ['sales executive', 'sales manager', 'account executive', 'business development manager', 'business development executive', 'sales representative', 'telesales', 'inside sales', 'key account manager'],
    duties: ['sales targets', 'quota', 'cold calling', 'closing deals', 'pipeline generation', 'revenue targets', 'client acquisition', 'door to door'],
  },
  {
    id: 'accounting',
    label: 'Accounting/Audit (non-tech)',
    titles: ['accountant', 'accounts executive', 'accounts payable', 'accounts receivable', 'auditor', 'audit associate', 'bookkeeper', 'chief accountant', 'tax consultant', 'finance manager', 'financial analyst', 'credit analyst', 'treasury analyst'],
    duties: ['journal entries', 'month-end closing', 'ifrs', 'bank reconciliations', 'audit fieldwork', 'statutory audit', 'vat returns', 'financial statements', 'accounts payable', 'general ledger postings'],
  },
  {
    id: 'admin',
    label: 'Admin/Operations',
    titles: ['administrative assistant', 'office manager', 'receptionist', 'secretary', 'executive assistant', 'personal assistant', 'admin assistant', 'office administrator', 'data entry', 'document controller', 'operations coordinator'],
    duties: ['answering phones', 'diary management', 'travel arrangements', 'filing', 'office supplies', 'front desk', 'data entry'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare/Clinical',
    titles: ['nurse', 'doctor', 'physician', 'pharmacist', 'dentist', 'physiotherapist', 'medical officer', 'clinical', 'caregiver', 'lab technician', 'radiographer', 'patient', 'medical coder', 'medical billing'],
    duties: ['patient care', 'clinical care', 'medication administration', 'patient assessments', 'ward', 'dha license', 'moh license', 'haad license'],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    titles: ['teacher', 'tutor', 'lecturer', 'professor', 'teaching assistant', 'instructor', 'school counselor', 'education'],
    duties: ['lesson plans', 'lesson planning', 'classroom management', 'curriculum delivery', 'student assessment', 'grading'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality',
    titles: ['chef', 'cook', 'waiter', 'waitress', 'barista', 'housekeeping', 'front office', 'guest relations', 'concierge', 'bartender', 'steward'],
    duties: ['guest experience', 'food and beverage', 'f&b', 'room service', 'housekeeping', 'menu preparation'],
  },
  {
    id: 'product_design',
    label: 'Product/Design (non-engineering)',
    titles: ['product manager', 'product designer', 'ux designer', 'ui designer', 'ui/ux designer', 'graphic designer', 'designer', 'creative director', 'art director', 'illustrator', 'animator'],
    duties: ['product roadmap', 'user research', 'figma', 'wireframes', 'mockups', 'design system', 'go-to-market'],
  },
  {
    id: 'customer_service',
    label: 'Customer service',
    titles: ['customer service', 'customer support', 'customer support representative', 'customer success', 'call center', 'call centre', 'support specialist', 'client services', 'customer care'],
    duties: ['inbound calls', 'customer inquiries', 'ticket queue', 'call handling', 'csat', 'customer complaints'],
  },
  {
    id: 'project_ops',
    label: 'Project/Operations (non-tech)',
    titles: ['project manager', 'project coordinator', 'project scheduler', 'scheduler', 'program manager', 'operations manager', 'operations specialist', 'logistics coordinator', 'supply chain', 'procurement', 'purchasing', 'contracts', 'quantity surveyor', 'estimator', 'planner'],
    duties: ['primavera', 'gantt charts', 'vendor management', 'purchase orders', 'logistics', 'tendering', 'boq'],
  },
  {
    id: 'gig_creative',
    label: 'Gig/creative work',
    titles: ['voice over', 'translator', 'interpreter', 'annotator', 'evaluator', 'bidder', 'video editor', 'photographer', 'artist', 'transcriber', 'communications'],
    duties: ['voice recordings', 'transcription', 'annotation tasks', 'rate responses', 'bidding on'],
  },
  {
    id: 'trades',
    label: 'Trades/Field work',
    titles: ['driver', 'mecanico', 'electrician', 'plumber', 'technician', 'mechanic', 'security guard', 'warehouse', 'storekeeper', 'forklift', 'cleaner', 'gardener', 'handyman', 'site engineer', 'civil engineer', 'mechanical engineer', 'hvac'],
    duties: ['driving license', 'heavy vehicle', 'site supervision', 'preventive maintenance', 'shop drawings', 'warehouse operations'],
  },
]

/** Tech titles that stay tech whatever domain words they carry. */
const TECH_TITLE = termMatcher([
  'developer', 'software', 'engineer software', 'programmer', 'devops', 'data engineer', 'data analyst',
  'data scientist', 'bi developer', 'business intelligence', 'hris', 'martech', 'marketing technology',
  'marketing technologist', 'marketing automation engineer', 'salesforce developer', 'crm developer',
  'legal tech', 'legaltech', 'fintech', 'payments engineer', 'systems analyst', 'business analyst',
  'erp', 'technical', 'technologist', 'architect', 'qa', 'sdet', 'web', 'full stack', 'full-stack', 'it',
  'backend', 'back-end', 'frontend', 'front-end', 'mobile', 'cloud', 'integration', 'implementation',
  'solutions engineer', 'support engineer', 'automation', 'analytics', 'mis', 'odoo', 'sap', 'oracle',
])

const TITLE_MATCHERS = DOMAINS.map((d) => ({ d, match: termMatcher(d.titles) }))

export interface DomainEvidence {
  domain: DomainDef | null
  /** Title says so (strong) vs only JD duties. */
  fromTitle: boolean
  /** Duty phrases found in the JD. */
  duties: string[]
  /** The title reads as a tech role. */
  techTitle: boolean
}

export function domainEvidence(title: string, description: string | null | undefined): DomainEvidence {
  const t = normalizeForMatch(title)
  const techTitle = TECH_TITLE(t) !== null
  const jd = normalizeForMatch((description ?? '').slice(0, 8_000))
  let best: { d: DomainDef; fromTitle: boolean; duties: string[]; weight: number } | null = null
  for (const { d, match } of TITLE_MATCHERS) {
    const inTitle = match(t) !== null
    const duties = findTerms(jd, d.duties)
    const weight = (inTitle ? 2 : 0) + duties.length
    if (weight > 0 && (!best || weight > best.weight)) best = { d, fromTitle: inTitle, duties, weight }
  }
  if (!best) return { domain: null, fromTitle: false, duties: [], techTitle }
  return { domain: best.d, fromTitle: best.fromTitle, duties: best.duties, techTitle }
}
