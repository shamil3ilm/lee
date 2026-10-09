import { describe, it, expect } from 'vitest'
import { generateTailoredCV } from '@/lib/documents/tailor'
import { generateCoverLetter } from '@/lib/documents/coverLetter'
import { saveMasterCV } from '@/lib/documents/master'
import { MasterCVNotFoundError, ApplicationNotFoundError } from '@/lib/documents/errors'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as documentsQ from '@/lib/db/queries/documents'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import type { MasterCV } from '@/lib/documents/types'
import * as profileQ from '@/lib/db/queries/profile'

function makeCv(): MasterCV {
  return {
    basics: { name: 'Ada Lovelace', headline: 'Backend Engineer' },
    summary: 'Ships things.',
    experience: [
      {
        company: 'Acme',
        role: 'Senior Eng',
        start: '2020-01',
        end: 'present',
        bullets: ['built pipelines'],
      },
    ],
    skills: { primary: ['ts', 'node'] },
  }
}

async function seed(email: string) {
  const u = await makeUser(email)
  const co = await makeCompany(u.id, { name: 'Stripe' })
  const j = await makeJob(u.id, co.id, { title: 'Staff Engineer' })
  const app = await makeApplication(u.id, j.id)
  return { u, co, j, app }
}

describe('generateTailoredCV', () => {
  it('persists a tailored_cv document with next version', async () => {
    const { u, app } = await seed('tailor-1@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    expect(doc.kind).toBe('tailored_cv')
    expect(doc.version).toBe(1)
    expect(doc.title).toContain('Staff Engineer')
    expect(doc.title).toContain('Stripe')
    const list = await documentsQ.list(u.id, { applicationId: app.id, kind: 'tailored_cv' })
    expect(list).toHaveLength(1)
  })

  it('embeds a v9 stateSnapshot in content', async () => {
    const { u, app } = await seed('tailor-snap@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    const content = doc.content as {
      stateSnapshot?: {
        capturedAt: string
        hashes: Record<string, string>
        fields: Record<string, unknown>
      }
    }
    expect(content.stateSnapshot).toBeDefined()
    expect(content.stateSnapshot?.hashes.application).toMatch(/^[a-f0-9]{64}$/)
    expect(content.stateSnapshot?.hashes.job).toMatch(/^[a-f0-9]{64}$/)
    expect(content.stateSnapshot?.hashes.master_cv).toMatch(/^[a-f0-9]{64}$/)
  })

  it('increments version on repeat generation', async () => {
    const { u, app } = await seed('tailor-2@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    const second = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    expect(second.version).toBe(2)
  })

  it('throws MasterCVNotFoundError when no master saved', async () => {
    const { u, app } = await seed('tailor-3@x.com')
    const ai = new FixtureAIProvider()
    await expect(
      generateTailoredCV({ userId: u.id, applicationId: app.id, ai }),
    ).rejects.toBeInstanceOf(MasterCVNotFoundError)
  })

  it('throws ApplicationNotFoundError for missing app', async () => {
    const u = await makeUser('tailor-4@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await expect(
      generateTailoredCV({
        userId: u.id,
        applicationId: '00000000-0000-0000-0000-000000000000',
        ai,
      }),
    ).rejects.toBeInstanceOf(ApplicationNotFoundError)
  })
})

describe('generateCoverLetter', () => {
  it('persists a cover_letter document', async () => {
    const { u, app } = await seed('cover-1@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateCoverLetter({ userId: u.id, applicationId: app.id, ai })
    expect(doc.kind).toBe('cover_letter')
    expect(doc.version).toBe(1)
    expect(doc.title).toContain('Staff Engineer')
    const content = doc.content as { paragraphs: string[]; senderName: string }
    expect(content.senderName).toBe('Ada Lovelace')
    expect(content.paragraphs.length).toBeGreaterThan(0)
  })

  it('embeds a v9 stateSnapshot in content', async () => {
    const { u, app } = await seed('cover-snap@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateCoverLetter({ userId: u.id, applicationId: app.id, ai })
    const content = doc.content as {
      stateSnapshot?: { hashes: Record<string, string> }
    }
    expect(content.stateSnapshot?.hashes.job_parsed_meta).toMatch(/^[a-f0-9]{64}$/)
    expect(content.stateSnapshot?.hashes.master_cv).toMatch(/^[a-f0-9]{64}$/)
  })

  it('throws MasterCVNotFoundError when no master saved', async () => {
    const { u, app } = await seed('cover-2@x.com')
    const ai = new FixtureAIProvider()
    await expect(
      generateCoverLetter({ userId: u.id, applicationId: app.id, ai }),
    ).rejects.toBeInstanceOf(MasterCVNotFoundError)
  })
})

describe('region block from private settings', () => {
  it('a Dubai cover letter states visa, notice and relocation; nationality and CTC only on opt-in', async () => {
    const u = await makeUser('cover-gcc@x.com')
    const co = await makeCompany(u.id, { name: 'Example Gulf Co' })
    const j = await makeJob(u.id, co.id, { title: 'Laravel Developer', location: 'Dubai, UAE', remoteType: 'onsite' })
    const app = await makeApplication(u.id, j.id)
    await saveMasterCV(u.id, makeCv())
    await profileQ.upsert(u.id, {
      discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE'], noticePeriods: ['1_month'], relocationIfSponsored: true },
    })
    const doc = await generateCoverLetter({ userId: u.id, applicationId: app.id, ai: new FixtureAIProvider() })
    const last = (doc.content as { paragraphs: string[] }).paragraphs.at(-1)
    expect(last).toBe('Visa: Requires employment visa sponsorship for UAE. Notice period: 1 month. Relocation: Available to relocate to UAE.')
    expect(last).not.toMatch(/Nationality|CTC/)
  })

  it('a posting outside GCC / India / remote gets no block', async () => {
    const { u, app } = await seed('cover-none@x.com')
    await saveMasterCV(u.id, makeCv())
    await profileQ.upsert(u.id, { discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE'], noticePeriods: ['1_month'] } })
    const doc = await generateCoverLetter({ userId: u.id, applicationId: app.id, ai: new FixtureAIProvider() })
    expect((doc.content as { paragraphs: string[] }).paragraphs.join(' ')).not.toContain('Notice period')
  })
})
