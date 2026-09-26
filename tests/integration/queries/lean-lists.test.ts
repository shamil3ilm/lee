import { describe, it, expect } from 'vitest'
import * as appsQ from '@/lib/db/queries/applications'
import * as docsQ from '@/lib/db/queries/documents'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const BIG = 'lorem ipsum '.repeat(2_000)

describe('applications.list (lean rows)', () => {
  it('returns the job title/company summary without the description or parsed blobs', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, co.id, {
      title: 'Staff Engineer',
      location: 'Dubai',
      salaryMin: 100,
      descriptionMd: BIG,
      parsedMeta: { requirements: [BIG] },
      benefits: { note: BIG },
    })
    await makeApplication(u.id, j.id, { status: 'applied' })

    const [row] = await appsQ.list(u.id)
    expect(row).toMatchObject({
      status: 'applied',
      job: {
        id: j.id,
        title: 'Staff Engineer',
        location: 'Dubai',
        salaryMin: 100,
        sourceUrl: j.sourceUrl,
        company: { id: co.id, name: 'Stripe' },
      },
    })
    expect(row!.job).not.toHaveProperty('descriptionMd')
    expect(row!.job).not.toHaveProperty('parsedMeta')
    expect(row!.job).not.toHaveProperty('benefits')
    expect(JSON.stringify(row).length).toBeLessThan(2_000)
  })

  it('keeps a null company for jobs without one', async () => {
    const u = await makeUser()
    const j = await makeJob(u.id, null)
    await makeApplication(u.id, j.id)
    const [row] = await appsQ.list(u.id)
    expect(row!.job.company).toBeNull()
  })
})

describe('documents.list (no content)', () => {
  it('omits the content payload but keeps list metadata', async () => {
    const u = await makeUser()
    const doc = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'Master CV v1',
      content: { blob: BIG },
    })
    const [row] = await docsQ.list(u.id)
    expect(row).toMatchObject({ id: doc.id, kind: 'master_cv', version: 1, title: 'Master CV v1' })
    expect(row).not.toHaveProperty('content')
  })

  it('listWithContent still returns content for callers that render it', async () => {
    const u = await makeUser()
    await docsQ.create(u.id, {
      applicationId: null,
      kind: 'cover_letter',
      version: 1,
      title: 'CL',
      content: { body: 'hi' },
    })
    const [row] = await docsQ.listWithContent(u.id, { kind: 'cover_letter' })
    expect(row!.content).toEqual({ body: 'hi' })
  })

  it('getLatestMaster returns the highest-version standalone master CV with content', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id)
    const j = await makeJob(u.id, co.id)
    const app = await makeApplication(u.id, j.id)
    for (const version of [1, 3, 2]) {
      await docsQ.create(u.id, {
        applicationId: null,
        kind: 'master_cv',
        version,
        title: `v${version}`,
        content: { v: version },
      })
    }
    // An application-scoped master CV row never counts as "the" master.
    await docsQ.create(u.id, {
      applicationId: app.id,
      kind: 'master_cv',
      version: 9,
      title: 'scoped',
      content: { v: 9 },
    })
    const latest = await docsQ.getLatestMaster(u.id)
    expect(latest?.title).toBe('v3')
    expect(latest?.content).toEqual({ v: 3 })
    expect(await docsQ.getLatestMaster((await makeUser()).id)).toBeNull()
  })
})
