import { describe, it, expect } from 'vitest'
import {
  AISkippedError,
  checkCoverLetterSignal,
  checkDebriefSignal,
  checkDiscoveryScoringSignal,
  checkExpenseClassifySignal,
  checkFollowupSignal,
  checkOutreachSignal,
  checkParseJobSignal,
  checkPrepPackSignal,
  checkTailorCVSignal,
  _internal,
} from '@/lib/ai/signal'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { MasterCV } from '@/lib/documents/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { InterviewStage } from '@/lib/db/queries/stages'

function makeMaster(overrides: Partial<MasterCV> = {}): MasterCV {
  return {
    basics: { name: 'Ada Lovelace', headline: 'Backend Engineer' },
    summary: '',
    experience: [
      {
        company: 'Acme',
        role: 'Engineer',
        start: '2020-01',
        end: 'present',
        bullets: ['shipped things'],
      },
    ],
    skills: { primary: ['ts'] },
    ...overrides,
  }
}

function makeApp(overrides: {
  title?: string
  companyName?: string | null
  appliedAt?: Date | null
} = {}): ApplicationWithJob {
  const { title = 'Staff Engineer', companyName = 'Stripe', appliedAt = null } = overrides
  return {
    id: 'app-1',
    userId: 'user-1',
    jobId: 'job-1',
    status: 'applied',
    source: null,
    referredByContactId: null,
    interestLevel: null,
    appliedAt,
    nextActionAt: null,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    job: {
      id: 'job-1',
      userId: 'user-1',
      companyId: 'co-1',
      title,
      sourceUrl: 'https://x.com/j',
      location: null,
      remoteType: null,
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      descriptionMd: null,
      parsedMeta: {},
      benefits: {},
      postedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      company: companyName
        ? ({
            id: 'co-1',
            userId: 'user-1',
            name: companyName,
            domain: null,
            headquartersCity: null,
            headquartersCountry: null,
            officeLocations: [],
            remoteFriendly: null,
            size: null,
            stage: null,
            website: null,
            techStack: [],
            isWatched: false,
            stance: null,
            interestLevel: null,
            notesMd: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ApplicationWithJob['job']['company'])
        : null,
    },
  } as ApplicationWithJob
}

describe('checkParseJobSignal', () => {
  it('fails on empty text', () => {
    const r = checkParseJobSignal('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('parse_job_too_short')
  })

  it('fails on text shorter than the minimum', () => {
    const r = checkParseJobSignal('Short JD text.')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('parse_job_too_short')
  })

  it('fails when there are no proper nouns beyond the leading char', () => {
    const long = 'a'.repeat(_internal.PARSE_JOB_MIN_CHARS + 20)
    const r = checkParseJobSignal(long)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('parse_job_no_proper_nouns')
  })

  it('passes on a realistic JD with proper nouns', () => {
    const text =
      'We are Acme Inc looking for a Senior Engineer to build our Postgres + TypeScript platform. '.repeat(
        3,
      )
    expect(checkParseJobSignal(text).ok).toBe(true)
  })
})

describe('checkTailorCVSignal', () => {
  it('fails when master is null', () => {
    const r = checkTailorCVSignal(makeApp(), null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('no_master_cv')
  })

  it('fails when master has no experience', () => {
    const r = checkTailorCVSignal(makeApp(), makeMaster({ experience: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('master_no_experience')
  })

  it('fails when the job has no company name', () => {
    const r = checkTailorCVSignal(makeApp({ companyName: null }), makeMaster())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('job_no_company')
  })

  it('passes when everything is present', () => {
    expect(checkTailorCVSignal(makeApp(), makeMaster()).ok).toBe(true)
  })
})

describe('checkCoverLetterSignal', () => {
  it('fails when master is missing', () => {
    const r = checkCoverLetterSignal(makeApp(), null)
    expect(r.ok).toBe(false)
  })

  it('passes when everything is present', () => {
    expect(checkCoverLetterSignal(makeApp(), makeMaster()).ok).toBe(true)
  })
})

describe('checkOutreachSignal', () => {
  it('fails when the sender has no name', () => {
    const master = makeMaster({ basics: { name: '', headline: 'x' } })
    const r = checkOutreachSignal(makeApp(), master, 'linkedin_connection')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('outreach_no_sender_name')
  })

  it('fails when the job has no company', () => {
    const r = checkOutreachSignal(
      makeApp({ companyName: null }),
      makeMaster(),
      'linkedin_connection',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('job_no_company')
  })

  it('fails on linkedin_message with no linked contact', () => {
    const r = checkOutreachSignal(makeApp(), makeMaster(), 'linkedin_message', {
      linkedContactCount: 0,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('outreach_no_linked_contact')
  })

  it('passes on linkedin_message when a contact is linked', () => {
    const r = checkOutreachSignal(makeApp(), makeMaster(), 'linkedin_message', {
      linkedContactCount: 1,
    })
    expect(r.ok).toBe(true)
  })

  it('passes on linkedin_connection with no linked contact', () => {
    expect(checkOutreachSignal(makeApp(), makeMaster(), 'linkedin_connection').ok).toBe(true)
  })
})

describe('checkFollowupSignal', () => {
  it('fails when appliedAt is null', () => {
    const r = checkFollowupSignal(makeApp({ appliedAt: null }), 7)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('followup_no_applied_at')
  })

  it('fails when daysSince is under the minimum', () => {
    const r = checkFollowupSignal(makeApp({ appliedAt: new Date() }), 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('followup_too_soon')
  })

  it('passes when appliedAt is set and daysSince is meaningful', () => {
    const r = checkFollowupSignal(makeApp({ appliedAt: new Date() }), 7)
    expect(r.ok).toBe(true)
  })
})

describe('checkPrepPackSignal', () => {
  it('fails when master is missing', () => {
    const r = checkPrepPackSignal(makeApp(), null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('no_master_cv')
  })

  it('passes with a full master + application', () => {
    expect(checkPrepPackSignal(makeApp(), makeMaster()).ok).toBe(true)
  })
})

describe('checkDebriefSignal', () => {
  const stage = (status: string): Pick<InterviewStage, 'status'> => ({ status })

  it('fails when the stage is not completed', () => {
    const r = checkDebriefSignal(stage('scheduled'), 'notes')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('debrief_stage_not_completed')
  })

  it('fails when notes are only the template scaffold', () => {
    const template = `## What went well\n-\n\n## What to improve\n-`
    const r = checkDebriefSignal(stage('completed'), template)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('debrief_empty_notes')
  })

  it('passes when notes have real content', () => {
    const notes = `## What went well\n- Explained the design clearly.\n`
    const r = checkDebriefSignal(stage('completed'), notes)
    expect(r.ok).toBe(true)
  })
})

describe('checkDiscoveryScoringSignal', () => {
  const baseProfile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    ({
      skills: [],
      industries: [],
      roleTypes: [],
      ...overrides,
    } as unknown as UserProfile)

  it('fails when profile is null', () => {
    const r = checkDiscoveryScoringSignal(null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('discovery_no_profile')
  })

  it('fails when signals sum below the threshold', () => {
    const r = checkDiscoveryScoringSignal(baseProfile({ skills: ['ts'], industries: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('discovery_profile_thin')
  })

  it('passes at exactly the threshold', () => {
    const r = checkDiscoveryScoringSignal(
      baseProfile({ skills: ['ts', 'node'], industries: ['fintech'] }),
    )
    expect(r.ok).toBe(true)
  })
})

describe('checkExpenseClassifySignal', () => {
  it('fails when both fields empty', () => {
    const r = checkExpenseClassifySignal('', '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('expense_no_signal')
  })

  it('passes with a vendor', () => {
    expect(checkExpenseClassifySignal(undefined, 'Netflix').ok).toBe(true)
  })

  it('passes with a description', () => {
    expect(checkExpenseClassifySignal('coffee at the airport', undefined).ok).toBe(true)
  })
})

describe('AISkippedError', () => {
  it('carries code and fixHint through the exception', () => {
    const err = new AISkippedError('x_code', 'x_message', 'x_hint')
    expect(err.name).toBe('AISkippedError')
    expect(err.code).toBe('x_code')
    expect(err.fixHint).toBe('x_hint')
    expect(err.message).toBe('x_message')
  })
})
