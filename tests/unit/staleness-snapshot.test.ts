import { describe, it, expect } from 'vitest'
import {
  snapshotForCoverLetter,
  snapshotForDebrief,
  snapshotForFollowup,
  snapshotForMerged,
  snapshotForOutreach,
  snapshotForPrepPack,
  snapshotForTailoredCV,
  type ApplicationRecord,
  type JobRecord,
  type StageRecord,
} from '@/lib/staleness/snapshot'
import type { Activity } from '@/lib/db/queries/activities'
import type { Document } from '@/lib/db/queries/documents'
import type { MasterCV } from '@/lib/documents/types'

function isoRe(): RegExp {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
}

function makeApp(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'app-1',
    status: 'applied',
    appliedAt: new Date('2026-09-01T00:00:00Z'),
    jobId: 'job-1',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    companyId: 'co-1',
    companyName: 'Acme',
    ...overrides,
  }
}

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-1',
    title: 'Staff Engineer',
    descriptionMd: '# JD',
    parsedMeta: { tech_stack: ['go', 'kafka'] },
    benefits: { equity: true },
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  }
}

function makeMaster(overrides: Partial<MasterCV> = {}): MasterCV {
  return {
    basics: { name: 'Ada', headline: 'Engineer' },
    summary: 'Ships things.',
    experience: [],
    skills: { primary: ['go'] },
    ...overrides,
  }
}

function makeStage(overrides: Partial<StageRecord> = {}): StageRecord {
  return {
    id: 'stage-1',
    kind: 'tech_screen',
    title: 'Screen',
    scheduledAt: new Date('2026-09-10T15:00:00Z'),
    status: 'scheduled',
    prepNotesMd: null,
    googleEventId: null,
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  }
}

describe('snapshotForOutreach', () => {
  it('captures application, job, and master hashes', () => {
    const snap = snapshotForOutreach(makeApp(), makeJob(), makeMaster())
    expect(snap.capturedAt).toMatch(isoRe())
    expect(Object.keys(snap.hashes).sort()).toEqual([
      'application',
      'job',
      'master_cv',
    ])
    expect(snap.fields.applicationStatus).toBe('applied')
    expect(snap.fields.jobTitle).toBe('Staff Engineer')
    expect(snap.fields.companyName).toBe('Acme')
  })

  it('changes application hash when status changes', () => {
    const a = snapshotForOutreach(makeApp({ status: 'applied' }), makeJob(), makeMaster())
    const b = snapshotForOutreach(makeApp({ status: 'interview' }), makeJob(), makeMaster())
    expect(a.hashes.application).not.toBe(b.hashes.application)
    expect(a.hashes.job).toBe(b.hashes.job)
  })
})

describe('snapshotForFollowup', () => {
  it('captures latest activity when present', () => {
    const activity: Activity = {
      id: 'act-1',
      userId: 'u',
      applicationId: 'app-1',
      kind: 'email',
      payload: {},
      createdAt: new Date('2026-09-05T00:00:00Z'),
    }
    const snap = snapshotForFollowup(makeApp(), activity, 14)
    expect(snap.fields.daysSince).toBe(14)
    expect(snap.fields.latestActivityKind).toBe('email')
    expect(snap.fields.latestActivityAt).toBe('2026-09-05T00:00:00.000Z')
  })

  it('handles null latest activity', () => {
    const snap = snapshotForFollowup(makeApp(), null, 7)
    expect(snap.fields.latestActivityKind).toBeNull()
    expect(snap.fields.latestActivityAt).toBeNull()
  })

  it('changes activity hash when a new activity arrives', () => {
    const a = snapshotForFollowup(makeApp(), null, 7)
    const b = snapshotForFollowup(
      makeApp(),
      {
        id: 'act-1',
        userId: 'u',
        applicationId: 'app-1',
        kind: 'email',
        payload: {},
        createdAt: new Date(),
      },
      7,
    )
    expect(a.hashes.latest_activity).not.toBe(b.hashes.latest_activity)
  })
})

describe('snapshotForTailoredCV / snapshotForCoverLetter', () => {
  it('separates job_parsed_meta into its own hash', () => {
    const snap = snapshotForTailoredCV(makeApp(), makeJob(), makeMaster())
    expect(Object.keys(snap.hashes).sort()).toEqual([
      'application',
      'job',
      'job_benefits',
      'job_parsed_meta',
      'master_cv',
    ])
  })

  it('flags a parsed_meta drift with a distinct hash', () => {
    const before = snapshotForTailoredCV(
      makeApp(),
      makeJob({ parsedMeta: { tech_stack: ['go'] } }),
      makeMaster(),
    )
    const after = snapshotForTailoredCV(
      makeApp(),
      makeJob({ parsedMeta: { tech_stack: ['rust'] } }),
      makeMaster(),
    )
    expect(before.hashes.job_parsed_meta).not.toBe(after.hashes.job_parsed_meta)
  })

  it('flags a benefits drift independently', () => {
    const before = snapshotForCoverLetter(
      makeApp(),
      makeJob({ benefits: { equity: true } }),
      makeMaster(),
    )
    const after = snapshotForCoverLetter(
      makeApp(),
      makeJob({ benefits: { equity: false } }),
      makeMaster(),
    )
    expect(before.hashes.job_benefits).not.toBe(after.hashes.job_benefits)
    expect(before.hashes.master_cv).toBe(after.hashes.master_cv)
  })
})

describe('snapshotForPrepPack', () => {
  it('changes stage hash when scheduledAt moves', () => {
    const a = snapshotForPrepPack(makeApp(), makeStage(), makeJob())
    const b = snapshotForPrepPack(
      makeApp(),
      makeStage({ scheduledAt: new Date('2026-09-11T15:00:00Z') }),
      makeJob(),
    )
    expect(a.hashes.stage).not.toBe(b.hashes.stage)
  })

  it('captures stageKind + status + scheduledAt in fields', () => {
    const snap = snapshotForPrepPack(makeApp(), makeStage(), makeJob())
    expect(snap.fields.stageKind).toBe('tech_screen')
    expect(snap.fields.stageStatus).toBe('scheduled')
    expect(snap.fields.stageScheduledAt).toBe('2026-09-10T15:00:00.000Z')
  })
})

describe('snapshotForDebrief', () => {
  it('is stable when only prep notes change', () => {
    const a = snapshotForDebrief(makeStage(), makeApp(), makeJob())
    const b = snapshotForDebrief(
      makeStage({ prepNotesMd: 'new notes' }),
      makeApp(),
      makeJob(),
    )
    expect(a.hashes.stage).toBe(b.hashes.stage)
  })
})

describe('snapshotForMerged', () => {
  it('records per-source version+updatedAt hashes', () => {
    const doc: Document = {
      id: 'd1',
      userId: 'u',
      applicationId: null,
      kind: 'tailored_cv',
      version: 3,
      title: 'CV',
      content: {},
      aiPromptHash: null,
      aiGenerationMeta: {},
      createdAt: new Date(),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    }
    const snap = snapshotForMerged([doc])
    expect(snap.fields.sourceIds).toEqual(['d1'])
    expect((snap.fields.sourceVersions as Record<string, number>).d1).toBe(3)
    expect(snap.hashes.d1).toBeDefined()
  })

  it('changes the sources hash when a member version bumps', () => {
    const base: Document = {
      id: 'd1',
      userId: 'u',
      applicationId: null,
      kind: 'tailored_cv',
      version: 3,
      title: 'CV',
      content: {},
      aiPromptHash: null,
      aiGenerationMeta: {},
      createdAt: new Date(),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    }
    const bumped = { ...base, version: 4 }
    expect(snapshotForMerged([base]).hashes.sources).not.toBe(
      snapshotForMerged([bumped]).hashes.sources,
    )
  })
})
