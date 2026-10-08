import { parseResumeProfile, type ResumeProfile } from '@/lib/resume/types'
import type { MatchJob } from '@/lib/discovery/match/types'
import { recipeSchema, type Recipe } from '@/lib/variants/types'

/**
 * A synthetic profile for tailoring tests (no real data): ready items, an
 * approved alternate wording, a design-only (domain-ready) highlight, a
 * learning item and an unbacked learning skill.
 */
export function tailorProfile(): ResumeProfile {
  return parseResumeProfile({
    basics: {
      name: 'Rae Example',
      label: 'Backend Engineer',
      email: 'rae@example.com',
      summary: 'Backend engineer working on payments and finance tooling.',
    },
    work: [
      {
        id: 'w-pay',
        name: 'PayCo',
        position: 'Backend Engineer',
        startDate: '2022-01',
        highlights: [
          { id: 'h-recon', text: 'Automated daily reconciliation reports for the finance team.' },
          {
            id: 'h-hooks',
            text: 'Built payment webhooks in Laravel handling 2M events per day.',
            alternates: [{ id: 'w-hooks-idem', text: 'Built idempotent payment webhooks in Laravel handling 2M events per day.' }],
          },
          { id: 'h-zatca', text: 'Designed the ZATCA e-invoicing clearance flow.', depth: 'ai_assisted', domainReady: true },
          { id: 'h-k8s', text: 'Wrote Kubernetes manifests for staging.', depth: 'learning' },
        ],
      },
      {
        id: 'w-shop',
        name: 'ShopCo',
        position: 'Software Engineer',
        startDate: '2019-06',
        endDate: '2021-12',
        highlights: [
          { id: 'h-react', text: 'Shipped a React checkout used by 4 storefronts.' },
          { id: 'h-sql', text: 'Tuned MySQL queries for the orders service.' },
        ],
      },
    ],
    skills: [
      {
        id: 'g-1',
        name: 'Skills',
        skills: [
          { id: 'sk-php', name: 'PHP' },
          { id: 'sk-laravel', name: 'Laravel' },
          { id: 'sk-mysql', name: 'MySQL' },
          { id: 'sk-react', name: 'React' },
          { id: 'sk-redis', name: 'Redis' },
          { id: 'sk-k8s', name: 'Kubernetes', depth: 'learning' },
        ],
      },
    ],
  })
}

/** A variant recipe that leaves the MySQL bullet and skill out, with Redis first. */
export function tailorRecipe(over: Partial<Recipe> = {}): Recipe {
  return recipeSchema.parse({
    region: 'gcc',
    roleFamily: 'payments',
    headline: 'Backend Engineer',
    summary: 'Backend engineer working on payments and finance tooling.',
    work: [
      { id: 'w-pay', highlights: [{ id: 'h-recon' }, { id: 'h-hooks' }] },
      { id: 'w-shop', highlights: [{ id: 'h-react' }] },
    ],
    skills: ['sk-redis', 'sk-php', 'sk-laravel', 'sk-react'],
    ...over,
  })
}

export const TAILOR_JD: MatchJob = {
  title: 'Backend Engineer, Payments',
  location: 'Dubai, UAE',
  remoteType: 'onsite',
  descriptionMd: [
    '## Responsibilities',
    '- Build reconciliation and payout services.',
    '## Requirements',
    '- 3+ years with PHP and Laravel.',
    '- Strong PostgreSQL experience.',
    '- Kubernetes in production.',
    '- Experience with idempotent payment webhooks.',
    '- Experience operating Kafka for payment events.',
    '## Nice to have',
    '- React is a plus.',
  ].join('\n'),
}
