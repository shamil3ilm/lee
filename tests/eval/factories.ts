/**
 * v10.1 — eval fixtures share a small set of placeholder inputs so the JSON
 * fixture files can stay compact (a fixture only needs to override the
 * fields that make it distinctive). These helpers build the full-shape
 * Application / MasterCV / Job objects each AI method expects.
 *
 * Pure functions, no I/O — safe to import from both the runner and any
 * ad-hoc test scaffolding.
 */

import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { NormalizedJob, NormalizedCompany } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { InterviewStage } from '@/lib/db/queries/stages'

/** Deterministic UUID-shaped id derived from a label. Not RFC-valid, just stable. */
export function fakeId(label: string): string {
  const hex = Buffer.from(label).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function makeMasterCV(overrides: Partial<MasterCV> = {}): MasterCV {
  return {
    basics: {
      name: 'Shamil Test',
      headline: 'Senior Backend Engineer',
      email: 'shamil@example.com',
      location: 'Dubai, UAE',
      linkedin: 'https://linkedin.com/in/shamil',
      github: 'https://github.com/shamil',
    },
    summary:
      'Senior backend engineer with 8+ years shipping high-throughput fintech systems in PHP and TypeScript.',
    experience: [
      {
        company: 'OnlineCheckWriter',
        role: 'Senior Backend Engineer',
        start: '2022-06',
        end: 'present',
        bullets: [
          'Owned the batch payments pipeline processing $200M/quarter with p99 < 400ms.',
          'Migrated 30M-row Postgres tables to logical partitions with zero downtime.',
        ],
        tech: ['php', 'laravel', 'postgres', 'redis'],
      },
      {
        company: 'Careem',
        role: 'Backend Engineer',
        start: '2019-01',
        end: '2022-05',
        bullets: [
          'Rebuilt the driver-side pricing engine, reducing per-ride compute cost by 38%.',
          'Led the Kafka → gRPC migration for the dispatch fleet.',
        ],
        tech: ['go', 'kafka', 'grpc', 'postgres'],
      },
    ],
    skills: {
      primary: ['typescript', 'php', 'postgres', 'redis', 'laravel', 'kafka', 'go'],
      secondary: ['docker', 'terraform', 'kubernetes', 'grpc'],
    },
    education: [
      {
        school: 'IIT Madras',
        degree: 'BTech, Computer Science',
        start: '2013',
        end: '2017',
      },
    ],
    ...overrides,
  } as MasterCV
}

export function makeApplication(
  overrides: {
    role?: string
    company?: string
    remoteType?: 'remote' | 'hybrid' | 'onsite'
    location?: string
    descriptionMd?: string
    techStack?: string[]
    appliedAt?: Date
  } = {},
): ApplicationWithJob {
  const role = overrides.role ?? 'Senior Backend Engineer'
  const company = overrides.company ?? 'Stripe'
  const jobId = fakeId(`job-${company}-${role}`)
  const companyId = fakeId(`company-${company}`)
  const applicationId = fakeId(`app-${company}-${role}`)
  return {
    id: applicationId,
    userId: fakeId('user-shamil'),
    jobId,
    status: 'saved',
    source: 'discovery',
    referredByContactId: null,
    interestLevel: 4,
    appliedAt: overrides.appliedAt ?? null,
    nextActionAt: null,
    priority: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    job: {
      id: jobId,
      userId: fakeId('user-shamil'),
      companyId,
      title: role,
      sourceUrl: `https://jobs.${company.toLowerCase()}.com/${role.replace(/\s+/g, '-').toLowerCase()}`,
      location: overrides.location ?? 'Remote',
      remoteType: overrides.remoteType ?? 'remote',
      employmentType: 'fulltime',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      descriptionMd:
        overrides.descriptionMd ??
        `We are hiring a ${role} at ${company}. You will build scalable systems in TypeScript and Postgres.`,
      parsedMeta: { tech_stack: overrides.techStack ?? ['typescript', 'postgres'] },
      benefits: {},
      postedAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      company: {
        id: companyId,
        userId: fakeId('user-shamil'),
        name: company,
        domain: `${company.toLowerCase()}.com`,
        headquartersCity: null,
        headquartersCountry: null,
        officeLocations: [],
        remoteFriendly: true,
        size: null,
        stage: null,
        website: `https://${company.toLowerCase()}.com`,
        techStack: overrides.techStack ?? ['typescript', 'postgres'],
        isWatched: false,
        stance: null,
        interestLevel: null,
        notesMd: null,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      },
    },
  } as unknown as ApplicationWithJob
}

export function makeNormalizedJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    kind: 'job',
    title: 'Senior Backend Engineer',
    companyName: 'Stripe',
    companyDomain: 'stripe.com',
    location: 'Remote',
    remoteType: 'remote',
    employmentType: 'fulltime',
    descriptionMd: 'Build scalable payment infrastructure.',
    applyUrl: 'https://jobs.stripe.com/senior-backend-engineer',
    techStack: ['typescript', 'postgres'],
    raw: {},
    ...overrides,
  } as NormalizedJob
}

export function makeNormalizedCompany(
  overrides: Partial<NormalizedCompany> = {},
): NormalizedCompany {
  return {
    kind: 'company',
    name: 'Stripe',
    domain: 'stripe.com',
    industry: ['fintech'],
    size: '5000+',
    stage: 'Public',
    raw: {},
    ...overrides,
  } as NormalizedCompany
}

export function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: fakeId('profile-shamil'),
    userId: fakeId('user-shamil'),
    headline: 'Senior Backend Engineer',
    summaryMd: null,
    careerNarrativeMd: null,
    skills: ['typescript', 'php', 'postgres', 'laravel', 'kafka', 'go'],
    industries: ['fintech', 'payments'],
    roleTypes: ['backend', 'platform'],
    seniority: 'senior',
    yearsExperience: 8,
    employmentTypes: ['fulltime'],
    remotePref: 'remote',
    locationPrefs: [{ city: 'Dubai', country: 'UAE' }],
    acceptRelocation: false,
    willingToRelocateTo: [],
    compFloorAnnual: 150000,
    compCurrency: 'USD',
    stackWeights: { typescript: 10, postgres: 9, php: 8 },
    companySizeWeights: {},
    benefitPrefs: {},
    mustHaves: [],
    dealbreakers: [],
    keywords: [],
    aiProvider: null,
    aiModel: null,
    decisionProvider: null,
    layaEndpoint: null,
    syncedGmailAt: null,
    syncedCalendarAt: null,
    weeklyDigestEnabled: true,
    digestLastSentAt: null,
    notifyDiscoveryEmail: false,
    notifyDiscoveryBrowser: true,
    notifyDiscoveryMinScore: 75,
    discoveryEmailLastSentAt: null,
    timezone: 'Asia/Dubai',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as UserProfile
}

export function makeStage(
  overrides: {
    kind?: string
    title?: string
    scheduledAt?: Date
  } = {},
): Pick<InterviewStage, 'id' | 'kind' | 'title' | 'scheduledAt'> {
  return {
    id: fakeId(`stage-${overrides.kind ?? 'tech'}`),
    kind: overrides.kind ?? 'tech_screen',
    title: overrides.title ?? 'Technical Screen',
    scheduledAt: overrides.scheduledAt ?? new Date('2026-09-30T14:00:00Z'),
  }
}
