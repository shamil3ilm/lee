/**
 * v12.0 — CV fixtures for cv-score unit/integration tests. Pure data.
 */
import type { MasterCV } from '@/lib/documents/types'
import type { JobTarget } from '@/lib/cv-score/types'

export const NOW = new Date('2026-09-25T00:00:00Z')

export function strongCv(overrides: Partial<MasterCV> = {}): MasterCV {
  return {
    basics: {
      name: 'Alex Strong',
      headline: 'Senior Backend Engineer',
      email: 'alex@example.com',
      phone: '+971 50 123 4567',
      location: 'Dubai, UAE',
      linkedin: 'https://linkedin.com/in/alexstrong',
    },
    summary: 'Senior backend engineer with 9 years building payment platforms in TypeScript, Go and PostgreSQL.',
    experience: [
      {
        company: 'PayCo',
        role: 'Senior Backend Engineer',
        start: '2021-03',
        end: 'present',
        bullets: [
          'Led the redesign of the payments ledger in TypeScript and PostgreSQL, cutting reconciliation time by 65%.',
          'Architected an event-driven settlement pipeline on Kafka processing 4M transactions per day.',
          'Mentored 5 engineers through promotion cycles and established the team code review guidelines.',
          'Reduced p99 API latency from 900ms to 180ms by introducing Redis caching and query tuning.',
        ],
        tech: ['typescript', 'postgres', 'kafka', 'redis'],
      },
      {
        company: 'ShopWave',
        role: 'Backend Engineer',
        start: '2018-01',
        end: '2021-02',
        bullets: [
          'Built the order management service in Go serving 1.2M monthly customers across 3 markets.',
          'Migrated 40 cron jobs to Kubernetes CronJobs, saving $8k per month in infrastructure spend.',
          'Automated the release pipeline with GitHub Actions, shrinking deploy time from 45 to 8 minutes.',
        ],
        tech: ['go', 'kubernetes', 'docker'],
      },
      {
        company: 'DevHouse',
        role: 'Software Engineer',
        start: '2017-01',
        end: '2017-12',
        bullets: [
          'Developed 12 REST APIs in Node.js for a logistics client, handling 300 requests per second at peak.',
          'Wrote integration test suites that raised coverage from 40% to 85% across core services.',
          'Shipped a reporting dashboard adopted by 20 operations staff within its first two weeks.',
        ],
      },
    ],
    education: [{ school: 'University of Leeds', degree: 'BSc Computer Science', start: '2013', end: '2016' }],
    skills: {
      primary: ['TypeScript', 'Go', 'PostgreSQL', 'Kafka', 'Redis'],
      secondary: ['Docker', 'Kubernetes', 'GitHub Actions'],
    },
    ...overrides,
  }
}

export function weakCv(): MasterCV {
  return {
    basics: { name: 'Sam Weak', headline: 'Developer', email: 'sam@example.com' },
    summary: 'I am a hard working developer.',
    experience: [
      {
        company: 'Acme',
        role: 'Developer',
        start: '2022-01',
        end: 'present',
        bullets: [
          'Responsible for maintaining the website.',
          'Worked on various bug fixes.',
          'Helped the team with testing.',
          'Reports were written by me every week for the manager.',
        ],
      },
      {
        company: 'Beta',
        role: 'Junior Developer',
        start: '2019-01',
        end: '2020-06',
        bullets: ['Involved in the migration project.', 'Manage the internal tools'],
      },
    ],
    skills: { primary: ['HTML', 'CSS'] },
  }
}

export function stuffedCv(): MasterCV {
  const many = Array.from({ length: 45 }, (_, i) => `skill${i}`)
  return strongCv({
    summary: 'Kubernetes kubernetes Kubernetes expert. Kubernetes, kubernetes, k8s, Kubernetes, Kubernetes, Kubernetes!',
    skills: { primary: ['Kubernetes', ...many] },
  })
}

export const TWO_COLUMN_TEXT = [
  'JORDAN COLS',
  'jordan@example.com    +44 7700 900123',
  'EXPERIENCE    SKILLS',
  'Senior Engineer    TypeScript',
  'Acme Ltd    React',
  'Jan 2020 – Present    Node.js',
  '• Built things    AWS',
  '• Led a team of 4    Docker',
  'EDUCATION    LANGUAGES',
  'BSc Maths    English',
].join('\n')

export const NO_CONTACT_TEXT = [
  'Pat Nocontact',
  'Backend Developer',
  '',
  'Experience',
  'Backend Developer — Initech | Mar 2019 – Present',
  '• Built billing APIs in Python serving 10k customers',
  '• Reduced invoice errors by 30% with automated validation',
  '• Designed the Postgres schema for the reporting service',
  '',
  'Education',
  'BSc Computer Science — State University | 2015 – 2019',
  '',
  'Skills',
  'Python, Django, PostgreSQL, AWS',
].join('\n')

export function backendJd(overrides: Partial<JobTarget> = {}): JobTarget {
  return {
    applicationId: 'app-1',
    title: 'Senior Backend Engineer',
    companyName: 'FinPay',
    seniority: 'senior',
    techStack: ['TypeScript', 'Postgres', 'Kafka', 'AWS'],
    requirements: [
      '5+ years of backend engineering experience',
      'Strong experience with PostgreSQL and event-driven systems',
      'Experience mentoring engineers',
    ],
    niceToHave: ['Experience with Rust is a plus'],
    responsibilities: [
      'Design and build payment ledger services',
      'Mentor engineers and review code',
    ],
    descriptionMd:
      'FinPay is a fintech company building payments infrastructure for banks.\n\n## Nice to have\n- Rust\n',
    ...overrides,
  }
}
