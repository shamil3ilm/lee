/**
 * v17 §9.1 — demo data for the E2E test identity. Plain data only; the
 * insert logic lives in ./seed.ts. Everything here is fictional.
 */
import type { CoverLetter, MasterCV, TailoredCV } from '@/lib/documents/types'
import type { ApplicationStatus } from '@/lib/ui/status'

export const PROFILE = {
  headline: 'Senior Backend Engineer — payments & distributed systems',
  summaryMd:
    'Backend engineer with 8 years building payment rails, ledgers and high-throughput APIs in Go and TypeScript.',
  skills: ['Go', 'TypeScript', 'PostgreSQL', 'Kafka', 'Kubernetes', 'AWS', 'gRPC', 'Redis'],
  industries: ['fintech', 'developer tools'],
  roleTypes: ['backend', 'platform'],
  seniority: 'senior',
  yearsExperience: 8,
  employmentTypes: ['fulltime'],
  remotePref: 'hybrid',
  locationPrefs: [{ city: 'Bengaluru', country: 'IN' }],
  acceptRelocation: true,
  willingToRelocateTo: ['Dubai', 'Dublin'],
  compFloorAnnual: 4_500_000,
  compCurrency: 'INR',
  mustHaves: ['ownership of services', 'on-call with fair rotation'],
  dealbreakers: ['crypto trading'],
  keywords: ['payments', 'ledger', 'platform'],
  timezone: 'Asia/Kolkata',
}

export const COMPANIES = [
  { name: 'Razorpay', domain: 'razorpay.com', headquartersCity: 'Bengaluru', headquartersCountry: 'IN', size: '1001-5000', stage: 'late', website: 'https://razorpay.com', techStack: ['Go', 'PHP', 'Kafka'], isWatched: true, stance: 'target', interestLevel: 5, remoteFriendly: false },
  { name: 'Postman', domain: 'postman.com', headquartersCity: 'San Francisco', headquartersCountry: 'US', officeLocations: ['Bengaluru'], size: '501-1000', stage: 'late', website: 'https://postman.com', techStack: ['Node.js', 'TypeScript', 'AWS'], isWatched: true, stance: 'target', interestLevel: 4, remoteFriendly: true },
  { name: 'Stripe', domain: 'stripe.com', headquartersCity: 'Dublin', headquartersCountry: 'IE', size: '5000+', stage: 'late', website: 'https://stripe.com', techStack: ['Ruby', 'Go', 'Java'], isWatched: true, stance: 'dream', interestLevel: 5, remoteFriendly: true },
  { name: 'Zerodha', domain: 'zerodha.com', headquartersCity: 'Bengaluru', headquartersCountry: 'IN', size: '1001-5000', stage: 'profitable', techStack: ['Go', 'Python', 'PostgreSQL'], interestLevel: 4, remoteFriendly: false },
  { name: 'Freshworks', domain: 'freshworks.com', headquartersCity: 'Chennai', headquartersCountry: 'IN', size: '5000+', stage: 'public', techStack: ['Ruby', 'Java'], interestLevel: 3 },
  { name: 'Careem', domain: 'careem.com', headquartersCity: 'Dubai', headquartersCountry: 'AE', size: '1001-5000', stage: 'acquired', techStack: ['Kotlin', 'Go'], interestLevel: 3, remoteFriendly: false },
  { name: 'Atlassian', domain: 'atlassian.com', headquartersCity: 'Sydney', headquartersCountry: 'AU', officeLocations: ['Bengaluru'], size: '5000+', stage: 'public', techStack: ['Java', 'Kotlin', 'AWS'], interestLevel: 3, remoteFriendly: true },
]

export const CONTACTS = [
  { name: 'Priya Raman', company: 'Razorpay', role: 'Engineering Manager', email: 'priya.raman@example.com', linkedinUrl: 'https://www.linkedin.com/in/example-priya' },
  { name: 'Arjun Mehta', company: 'Postman', role: 'Technical Recruiter', email: 'arjun.mehta@example.com' },
  { name: 'Sara Haddad', company: 'Careem', role: 'Staff Engineer', phone: '+971 50 000 0000' },
  { name: 'Karthik Iyer', company: 'Zerodha', role: 'Former colleague', notes: 'Worked together on the ledger migration.' },
  { name: 'Emma Walsh', company: 'Stripe', role: 'Recruiting Coordinator', email: 'emma.walsh@example.com' },
]

interface SeedApplication {
  key: string
  company: string
  title: string
  url: string
  location: string
  remoteType: string
  status: ApplicationStatus
  trail: ApplicationStatus[]
  source: string
  interest: number
  priority: number
  createdDaysAgo: number
  appliedDaysAgo?: number
  nextActionDays?: number
  salary?: [number, number]
  referredBy?: string
  contactRole?: string
  description: string
}

const JD_BACKEND = `## About the role
We are hiring a **Senior Backend Engineer** to own core payment services.

## Requirements
- 6+ years building backend services in Go or Java
- Deep experience with PostgreSQL, Kafka and distributed systems
- Designed idempotent APIs and reconciliation jobs at scale
- Experience with Kubernetes and AWS in production

## Nice to have
- Ledger or double-entry accounting systems
- gRPC and event-driven architectures`

export const APPLICATIONS: SeedApplication[] = [
  { key: 'razorpay', company: 'Razorpay', title: 'Senior Software Engineer, Payments', url: 'https://razorpay.example/jobs/sse-payments', location: 'Bengaluru, IN', remoteType: 'hybrid', status: 'applied', trail: ['saved', 'applied'], source: 'referral', interest: 5, priority: 2, createdDaysAgo: 18, appliedDaysAgo: 10, nextActionDays: 2, salary: [4_000_000, 6_000_000], referredBy: 'Priya Raman', contactRole: 'referrer', description: JD_BACKEND },
  { key: 'postman', company: 'Postman', title: 'Senior Backend Engineer', url: 'https://postman.example/jobs/sbe', location: 'Bengaluru, IN', remoteType: 'hybrid', status: 'interview', trail: ['saved', 'applied', 'screen', 'interview'], source: 'linkedin', interest: 4, priority: 3, createdDaysAgo: 30, appliedDaysAgo: 26, nextActionDays: 1, salary: [4_500_000, 6_500_000], referredBy: 'Arjun Mehta', contactRole: 'recruiter', description: JD_BACKEND },
  { key: 'stripe', company: 'Stripe', title: 'Backend Engineer, Ledger', url: 'https://stripe.example/jobs/ledger', location: 'Dublin, IE', remoteType: 'onsite', status: 'screen', trail: ['saved', 'applied', 'screen'], source: 'company_site', interest: 5, priority: 3, createdDaysAgo: 22, appliedDaysAgo: 20, nextActionDays: 4, description: JD_BACKEND },
  { key: 'zerodha', company: 'Zerodha', title: 'Platform Engineer', url: 'https://zerodha.example/jobs/platform', location: 'Bengaluru, IN', remoteType: 'onsite', status: 'offer', trail: ['saved', 'applied', 'screen', 'interview', 'offer'], source: 'referral', interest: 4, priority: 2, createdDaysAgo: 45, appliedDaysAgo: 42, salary: [3_800_000, 5_000_000], referredBy: 'Karthik Iyer', contactRole: 'referrer', description: 'Platform team running Kubernetes and PostgreSQL for trading systems. Go required.' },
  { key: 'freshworks', company: 'Freshworks', title: 'Staff Engineer, Integrations', url: 'https://freshworks.example/jobs/staff-int', location: 'Chennai, IN', remoteType: 'hybrid', status: 'rejected', trail: ['saved', 'applied', 'rejected'], source: 'linkedin', interest: 3, priority: 1, createdDaysAgo: 50, appliedDaysAgo: 48, salary: [5_000_000, 7_000_000], description: 'Own the integrations platform. Ruby and Java.' },
  { key: 'careem', company: 'Careem', title: 'Senior Engineer, Wallet', url: 'https://careem.example/jobs/wallet', location: 'Dubai, AE', remoteType: 'onsite', status: 'withdrawn', trail: ['saved', 'applied', 'withdrawn'], source: 'referral', interest: 3, priority: 0, createdDaysAgo: 60, appliedDaysAgo: 55, description: 'Wallet and payouts in Kotlin and Go.' },
  { key: 'atlassian', company: 'Atlassian', title: 'Senior Backend Developer, Jira Platform', url: 'https://atlassian.example/jobs/jira-platform', location: 'Bengaluru, IN', remoteType: 'remote', status: 'saved', trail: ['saved'], source: 'discovery', interest: 3, priority: 1, createdDaysAgo: 3, salary: [4_200_000, 5_800_000], description: 'Java/Kotlin services on AWS for Jira platform teams.' },
  { key: 'razorpay-2', company: 'Razorpay', title: 'Engineering Manager, Settlements (a very long title that should wrap cleanly on small screens)', url: 'https://razorpay.example/jobs/em-settlements', location: 'Bengaluru, IN', remoteType: 'hybrid', status: 'saved', trail: ['saved'], source: 'discovery', interest: 2, priority: 0, createdDaysAgo: 1, description: 'Lead the settlements team.' },
  { key: 'postman-2', company: 'Postman', title: 'Backend Engineer II, API Network', url: 'https://postman.example/jobs/api-network', location: 'Remote, IN', remoteType: 'remote', status: 'applied', trail: ['saved', 'applied'], source: 'company_site', interest: 3, priority: 1, createdDaysAgo: 14, appliedDaysAgo: 8, description: JD_BACKEND },
]

interface SeedStage {
  key: string
  app: string
  kind: string
  title: string
  inDays: number
  duration: number
  status: string
  outcome?: string
  meetingUrl?: string
  prep?: string
  debrief?: string
}

export const STAGES: SeedStage[] = [
  { key: 'postman-screen', app: 'postman', kind: 'phone_screen', title: 'Recruiter screen', inDays: -14, duration: 30, status: 'completed', outcome: 'passed', debrief: 'Went well; discussed on-call and team size.' },
  { key: 'postman-tech', app: 'postman', kind: 'technical', title: 'Technical interview — API design', inDays: -5, duration: 60, status: 'completed', outcome: 'passed', prep: '- Idempotency keys\n- Rate limiting' },
  { key: 'postman-sd', app: 'postman', kind: 'system_design', title: 'System design — webhooks at scale', inDays: 2, duration: 60, status: 'scheduled', meetingUrl: 'https://meet.example/postman-sd', prep: '- Delivery guarantees\n- Retry with backoff' },
  { key: 'stripe-screen', app: 'stripe', kind: 'phone_screen', title: 'Recruiter call', inDays: 4, duration: 30, status: 'scheduled', meetingUrl: 'https://meet.example/stripe' },
  { key: 'zerodha-final', app: 'zerodha', kind: 'final', title: 'Final with CTO', inDays: -10, duration: 45, status: 'completed', outcome: 'passed' },
]

export const MASTER_CV: MasterCV = {
  basics: {
    name: 'Asha Menon',
    headline: 'Senior Backend Engineer',
    email: 'asha.menon@example.com',
    phone: '+91 90000 00000',
    location: 'Bengaluru, India',
    linkedin: 'https://www.linkedin.com/in/example-asha',
    github: 'https://github.com/example-asha',
  },
  summary:
    'Backend engineer with 8 years of experience designing payment and ledger systems in Go and TypeScript. Led migrations that cut settlement latency by 40% and processed 2M+ transactions per day.',
  experience: [
    {
      company: 'PayFlow',
      role: 'Senior Backend Engineer',
      location: 'Bengaluru',
      start: '2021-04',
      end: 'present',
      bullets: [
        'Designed an idempotent payouts API in Go handling 2M+ requests per day with 99.99% availability.',
        'Led the double-entry ledger migration to PostgreSQL, reducing reconciliation errors by 85%.',
        'Built Kafka-based event pipelines that cut settlement latency by 40%.',
        'Mentored 4 engineers and ran the on-call rotation for the payments platform.',
      ],
      tech: ['Go', 'PostgreSQL', 'Kafka', 'Kubernetes', 'AWS'],
    },
    {
      company: 'ShopKart',
      role: 'Backend Engineer',
      location: 'Bengaluru',
      start: '2018-01',
      end: '2021-03',
      bullets: [
        'Implemented gRPC order services in TypeScript and Go serving 30k RPS at peak.',
        'Reduced p95 checkout latency from 900ms to 250ms by introducing Redis caching.',
        'Automated deploys with Terraform and GitHub Actions, cutting release time by 70%.',
      ],
      tech: ['TypeScript', 'Go', 'Redis', 'gRPC', 'Terraform'],
    },
    {
      company: 'Infosys',
      role: 'Software Engineer',
      location: 'Mysuru',
      start: '2016-07',
      end: '2017-12',
      bullets: ['Built Java REST services for a banking client and wrote integration tests.'],
      tech: ['Java', 'Spring'],
    },
  ],
  projects: [
    {
      name: 'ledgerkit',
      url: 'https://github.com/example-asha/ledgerkit',
      description: 'Open-source double-entry ledger library for Go.',
      tech: ['Go', 'PostgreSQL'],
      highlights: ['400+ GitHub stars'],
    },
  ],
  education: [{ school: 'NIT Calicut', degree: 'B.Tech, Computer Science', start: '2012', end: '2016' }],
  skills: {
    primary: ['Go', 'TypeScript', 'PostgreSQL', 'Kafka', 'Kubernetes', 'AWS'],
    secondary: ['gRPC', 'Redis', 'Terraform', 'Java'],
  },
  certifications: [{ name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', date: '2022' }],
  languages: [
    { name: 'English', proficiency: 'Fluent' },
    { name: 'Malayalam', proficiency: 'Native' },
  ],
}

export function tailoredCv(applicationId: string): TailoredCV {
  return {
    ...MASTER_CV,
    summary:
      'Senior backend engineer focused on API platforms: 8 years building idempotent, high-throughput services in Go and TypeScript on Kubernetes and AWS.',
    _tailoring: {
      applicationId,
      reasoning: 'Emphasised API design and platform ownership for Postman.',
      highlighted_skills: ['Go', 'TypeScript', 'Kubernetes'],
      reordered_experience_indices: [0, 1, 2],
      summary_rewrite: true,
    },
  }
}

export function coverLetter(applicationId: string): CoverLetter {
  return {
    applicationId,
    greeting: 'Dear Priya,',
    paragraphs: [
      'I am applying for the Senior Software Engineer, Payments role at Razorpay. I have spent the last four years building payout and ledger systems that move money reliably at scale.',
      'At PayFlow I led the migration to a double-entry ledger in PostgreSQL, cutting reconciliation errors by 85%, and designed an idempotent payouts API serving 2M+ requests per day.',
      'I would love to bring that experience to Razorpay’s settlements platform.',
    ],
    closing: 'Kind regards,',
    senderName: 'Asha Menon',
  }
}

export const LATEX_CV = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[margin=0.9in]{geometry}
\begin{document}
\begin{center}{\LARGE\textbf{Asha Menon}}\\Senior Backend Engineer\end{center}
\section*{Experience}
\textbf{PayFlow} --- Senior Backend Engineer \hfill 2021--present
\begin{itemize}
  \item Designed an idempotent payouts API in Go handling 2M+ requests per day.
\end{itemize}
\end{document}
`

interface SeedTodo {
  title: string
  status: 'open' | 'done' | 'archived'
  priority: number
  dueDays?: number
  app?: string
  stage?: string
  tags: string[]
  notes?: string
}

export const TODOS: SeedTodo[] = [
  { title: 'Follow up with Priya about the Razorpay referral', status: 'open', priority: 3, dueDays: -2, app: 'razorpay', tags: ['follow-up'] },
  { title: 'Prepare webhooks system design notes', status: 'open', priority: 3, dueDays: 1, app: 'postman', stage: 'postman-sd', tags: ['prep', 'system-design'] },
  { title: 'Send thank-you note after Postman technical round', status: 'done', priority: 2, dueDays: -4, app: 'postman', tags: ['follow-up'] },
  { title: 'Review Zerodha offer letter and benefits', status: 'open', priority: 2, dueDays: 3, app: 'zerodha', tags: ['offer'], notes: 'Compare ESOP vesting with current employer.' },
  { title: 'Update LinkedIn headline', status: 'open', priority: 1, tags: ['profile'] },
  { title: 'Archive old Careem notes', status: 'archived', priority: 0, tags: [] },
]

interface SeedExpense {
  monthsBack: number
  dom: number
  rupees: number
  category: string
  vendor: string
  sub?: string
  description?: string
  recurring?: boolean
}

const MONTHLY: Omit<SeedExpense, 'monthsBack'>[] = [
  { dom: 1, rupees: 32000, category: 'rent', vendor: 'Landlord', description: 'Apartment rent', recurring: true },
  { dom: 3, rupees: 649, category: 'subscription', sub: 'streaming', vendor: 'Netflix', recurring: true },
  { dom: 4, rupees: 999, category: 'internet', vendor: 'ACT Fibernet', recurring: true },
  { dom: 5, rupees: 1850, category: 'electricity', vendor: 'BESCOM' },
  { dom: 6, rupees: 4200, category: 'groceries', vendor: 'BigBasket' },
  { dom: 9, rupees: 1350, category: 'dining', vendor: 'Truffles' },
  { dom: 11, rupees: 780, category: 'transport', sub: 'cab', vendor: 'Uber' },
  { dom: 14, rupees: 2600, category: 'fuel', vendor: 'Indian Oil' },
  { dom: 18, rupees: 3100, category: 'groceries', vendor: 'Zepto' },
  { dom: 21, rupees: 1499, category: 'education', vendor: 'Coursera', description: 'System design course' },
]

export const EXPENSES: SeedExpense[] = [
  ...[0, 1, 2].flatMap((monthsBack) => MONTHLY.map((e) => ({ ...e, monthsBack }))),
  { monthsBack: 0, dom: 2, rupees: 5400, category: 'health', vendor: 'Apollo Pharmacy' },
  { monthsBack: 1, dom: 16, rupees: 18500, category: 'travel', vendor: 'IndiGo', description: 'Flight to interview onsite' },
  { monthsBack: 2, dom: 12, rupees: 2400, category: 'gifts', vendor: 'Amazon' },
]

export const BUDGETS = [
  { category: 'groceries', rupees: 8000 },
  { category: 'dining', rupees: 3000 },
  { category: 'transport', rupees: 2500 },
  { category: 'subscription', rupees: 1500 },
]

interface SeedDiscovery {
  status: string
  score: number | null
  benefits: number | null
  job: {
    title: string
    companyName: string
    companyDomain?: string
    location?: string
    remoteType?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
    employmentType?: 'fulltime' | 'contract'
    descriptionMd: string
    applyUrl: string
    techStack: string[]
    salary?: { min?: number; max?: number; currency?: string }
  }
  reasoning: Record<string, unknown> | null
}

export const DISCOVERIES: SeedDiscovery[] = [
  { status: 'new', score: 91, benefits: 72, job: { title: 'Senior Backend Engineer, Ledger', companyName: 'Juspay', companyDomain: 'juspay.example', location: 'Bengaluru, IN', remoteType: 'hybrid', employmentType: 'fulltime', descriptionMd: JD_BACKEND, applyUrl: 'https://juspay.example/jobs/ledger', techStack: ['Go', 'PostgreSQL', 'Kafka'], salary: { min: 4_500_000, max: 6_000_000, currency: 'INR' } }, reasoning: { summary: 'Strong match: ledger + Go + Kafka.', strengths: ['Ledger migration experience', 'Go and Kafka in production'], red_flags: [], stack_overlap: ['Go', 'PostgreSQL', 'Kafka'], stack_gaps: [] } },
  { status: 'new', score: 78, benefits: 60, job: { title: 'Platform Engineer (Kubernetes)', companyName: 'CRED', companyDomain: 'cred.example', location: 'Bengaluru, IN', remoteType: 'onsite', employmentType: 'fulltime', descriptionMd: 'Run our Kubernetes platform on AWS.', applyUrl: 'https://cred.example/jobs/platform', techStack: ['Kubernetes', 'AWS', 'Terraform'] }, reasoning: { summary: 'Good platform overlap.', strengths: ['Kubernetes', 'AWS'], red_flags: ['Onsite five days a week'], stack_overlap: ['Kubernetes', 'AWS'], stack_gaps: ['Istio'] } },
  { status: 'new', score: 64, benefits: null, job: { title: 'Backend Engineer, Webhooks', companyName: 'Hasura', companyDomain: 'hasura.example', location: 'Remote', remoteType: 'remote', employmentType: 'fulltime', descriptionMd: 'Build our webhook delivery pipeline.', applyUrl: 'https://hasura.example/jobs/webhooks', techStack: ['Haskell', 'Go', 'PostgreSQL'] }, reasoning: { summary: 'Partial match; Haskell is a gap.', strengths: ['PostgreSQL'], red_flags: [], stack_overlap: ['Go', 'PostgreSQL'], stack_gaps: ['Haskell'] } },
  { status: 'new', score: 42, benefits: 35, job: { title: 'Senior Data Engineer', companyName: 'Swiggy', companyDomain: 'swiggy.example', location: 'Bengaluru, IN', remoteType: 'hybrid', employmentType: 'fulltime', descriptionMd: 'Spark and Airflow pipelines.', applyUrl: 'https://swiggy.example/jobs/data', techStack: ['Spark', 'Airflow', 'Scala'] }, reasoning: { summary: 'Weak match: data engineering.', strengths: [], red_flags: ['Different specialisation'], stack_overlap: [], stack_gaps: ['Spark', 'Scala'] } },
  { status: 'new', score: null, benefits: null, job: { title: 'Software Engineer — Payments Infrastructure (Contract, 6 months, extension possible)', companyName: 'Tabby', location: 'Dubai, AE', remoteType: 'unknown', employmentType: 'contract', descriptionMd: 'Contract role.', applyUrl: 'https://tabby.example/jobs/payments', techStack: [] }, reasoning: null },
  { status: 'dismissed', score: 30, benefits: 20, job: { title: 'Frontend Engineer', companyName: 'Meesho', location: 'Bengaluru, IN', remoteType: 'hybrid', employmentType: 'fulltime', descriptionMd: 'React.', applyUrl: 'https://meesho.example/jobs/fe', techStack: ['React'] }, reasoning: { summary: 'Frontend role.' } },
]

export const COMPANY_DISCOVERIES = [
  { score: 82, company: { name: 'Setu', domain: 'setu.example', description: 'Financial APIs for India.', industry: ['fintech'], size: '51-200', stage: 'series-a', hqCountry: 'IN', hqCity: 'Bengaluru', techStack: ['Go', 'PostgreSQL'] }, reasoning: { summary: 'Fintech APIs, Go stack.' } },
  { score: 58, company: { name: 'Plane', domain: 'plane.example', description: 'Open-source project management.', industry: ['developer tools'], size: '11-50', stage: 'seed', hqCountry: 'IN', hqCity: 'Bengaluru', techStack: ['Python', 'TypeScript'] }, reasoning: { summary: 'Dev tools, smaller team.' } },
]

export const AI_CALLS = [
  ...Array.from({ length: 8 }, () => ({ provider: 'gemini', kind: 'score_job', promptTokens: 1800, completionTokens: 220, latencyMs: 1400, status: 'ok' })),
  ...Array.from({ length: 3 }, () => ({ provider: 'gemini', kind: 'cover_letter', promptTokens: 2600, completionTokens: 600, latencyMs: 3200, status: 'ok', userRating: 5 })),
  { provider: 'groq', kind: 'parse_job', promptTokens: 1500, completionTokens: 300, latencyMs: 800, status: 'error', error: 'rate limited' },
  { provider: 'signal', kind: 'cv_requirement_fit', status: 'skipped', signalCheckPassed: false, signalCheckCode: 'thin_jd' },
]
