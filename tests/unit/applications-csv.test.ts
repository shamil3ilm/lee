import { describe, it, expect } from 'vitest'
import { applicationsToCsv, csvFilename } from '@/lib/applications/csv'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

function makeRow(overrides: Partial<ApplicationWithJob> = {}): ApplicationWithJob {
  const base = {
    id: 'app-1',
    userId: 'user-1',
    jobId: 'job-1',
    status: 'applied',
    source: 'linkedin',
    referredByContactId: null,
    interestLevel: 4,
    appliedAt: new Date('2026-01-02T10:00:00Z'),
    nextActionAt: null,
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    job: {
      id: 'job-1',
      userId: 'user-1',
      companyId: 'co-1',
      title: 'Senior, Payments',
      sourceUrl: 'https://acme.com/jobs/1',
      location: 'Remote, EU',
      remoteType: 'remote',
      employmentType: 'full_time',
      salaryMin: 100000,
      salaryMax: 150000,
      salaryCurrency: 'USD',
      descriptionMd: null,
      parsedMeta: {},
      benefits: {},
      postedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      company: {
        id: 'co-1',
        userId: 'user-1',
        name: 'Acme "Inc"',
        domain: 'acme.com',
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
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    },
  } as unknown as ApplicationWithJob
  return { ...base, ...overrides }
}

describe('applicationsToCsv', () => {
  it('starts with a UTF-8 BOM and the header row', () => {
    const csv = applicationsToCsv([])
    // BOM (﻿) then header + CRLF
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('Company,Title,Status')
  })

  it('escapes commas and quotes properly', () => {
    const row = makeRow()
    const csv = applicationsToCsv([row])
    // Company has a quote → wrapped in quotes with doubled quote.
    expect(csv).toContain('"Acme ""Inc"""')
    // Title has a comma → wrapped in quotes.
    expect(csv).toContain('"Senior, Payments"')
  })

  it('emits ISO-8601 for dates and empty string for nulls', () => {
    const row = makeRow({ nextActionAt: null })
    const csv = applicationsToCsv([row])
    expect(csv).toContain('2026-01-02T10:00:00.000Z')
    // 2 consecutive commas would indicate an empty column — assert nextAction was empty.
    expect(csv).toMatch(/,,/)
  })
})

describe('csvFilename', () => {
  it('formats YYYY-MM-DD', () => {
    const name = csvFilename(new Date('2026-09-25T09:30:00Z'))
    expect(name).toBe('lee-applications-2026-09-25.csv')
  })
})
