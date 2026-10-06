import { highlightSchema, parseResumeProfile, type Highlight, type ResumeProfile } from '@/lib/resume/types'

/** A highlight with schema defaults (readiness, visibility) filled in. */
export function hl(id: string, text: string, extra: Record<string, unknown> = {}): Highlight {
  return highlightSchema.parse({ id, text, ...extra })
}

/**
 * A synthetic person (no real data): the master profile most résumé,
 * variant and portfolio tests start from. Valid for publishing as-is.
 */
export function syntheticProfile(): ResumeProfile {
  return parseResumeProfile({
    basics: {
      name: 'Asha Menon',
      label: 'Backend Engineer',
      email: 'asha.menon@example.com',
      phone: '+971 50 000 0000',
      url: 'https://asha.example.dev',
      summary: 'Backend engineer building payment and ledger systems in Go and TypeScript.',
      location: { city: 'Dubai', countryCode: 'AE' },
      nationality: 'Indian',
      visaStatus: 'Available on visit visa / requires sponsorship',
      noticePeriod: '1 month',
      expectedSalary: 'AED 18,000 / month',
      profiles: [
        { id: 'p-gh', network: 'GitHub', username: 'example-asha', url: 'https://github.com/example-asha' },
        { id: 'p-li', network: 'LinkedIn', username: 'example-asha', url: 'https://www.linkedin.com/in/example-asha' },
      ],
    },
    work: [
      {
        id: 'w-payflow',
        name: 'PayFlow',
        position: 'Backend Engineer',
        location: 'Dubai',
        startDate: '2021-04',
        highlights: [
          { id: 'h-payouts', text: 'Designed an idempotent payouts API in Go handling 2M+ requests per day.' },
          { id: 'h-ledger', text: 'Led the double-entry ledger migration to PostgreSQL, cutting reconciliation errors by 85%.' },
          { id: 'h-zatca', text: 'Integrated ZATCA e-invoicing clearance for 3 Saudi merchants.' },
        ],
        keywords: ['Go', 'PostgreSQL', 'Kafka'],
      },
      {
        id: 'w-shopkart',
        name: 'ShopKart',
        position: 'Software Engineer',
        location: 'Bengaluru',
        startDate: '2018-01',
        endDate: '2021-03',
        highlights: [
          { id: 'h-grpc', text: 'Built gRPC order services in TypeScript serving 30k RPS at peak.' },
          { id: 'h-react', text: 'Shipped a React checkout used by 4 storefronts.' },
        ],
        keywords: ['TypeScript', 'React', 'Redis'],
      },
    ],
    projects: [
      {
        id: 'pr-ledger',
        name: 'Open Ledger',
        description: 'Double-entry ledger library',
        url: 'https://github.com/example-asha/open-ledger',
        keywords: ['Go', 'PostgreSQL'],
        highlights: [{ id: 'h-ol', text: 'Property-tested double-entry invariants.' }],
      },
    ],
    skills: [
      {
        id: 's-lang',
        name: 'Languages',
        skills: [
          { id: 'sk-go', name: 'Go' },
          { id: 'sk-ts', name: 'TypeScript' },
          { id: 'sk-php', name: 'PHP' },
        ],
      },
      {
        id: 's-data',
        name: 'Databases',
        skills: [
          { id: 'sk-pg', name: 'PostgreSQL' },
          { id: 'sk-redis', name: 'Redis' },
        ],
      },
    ],
    education: [
      {
        id: 'e-btech',
        institution: 'Example Institute of Technology',
        studyType: 'B.Tech',
        area: 'Computer Science',
        startDate: '2014',
        endDate: '2018',
      },
    ],
    languages: [
      { id: 'l-en', language: 'English', fluency: 'fluent' },
      { id: 'l-ar', language: 'Arabic', fluency: 'basic' },
    ],
    certificates: [{ id: 'c-aws', name: 'AWS Certified Developer', issuer: 'Amazon Web Services', date: '2022-06' }],
    portfolio: {
      displayName: 'Asha Menon',
      canonical: 'https://asha.example.dev/profile.json',
      caseStudies: [
        { id: 'payouts', title: 'Idempotent payouts', url: 'https://asha.example.dev/case-payouts.html', workId: 'w-payflow', highlightId: 'h-payouts' },
      ],
      quickView: {
        role: 'Backend Engineer',
        line: 'Payments and ledgers in Go.',
        results: [{ id: 'q-1', lead: 'Payouts', text: '2M+ requests per day, idempotent by design.' }],
        skills: ['Go', 'PostgreSQL'],
      },
    },
  })
}
