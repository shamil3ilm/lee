import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/documents'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'

async function seedApp(email = `doc-${Math.random()}@x.com`) {
  const u = await makeUser(email)
  const co = await makeCompany(u.id)
  const j = await makeJob(u.id, co.id)
  const app = await makeApplication(u.id, j.id)
  return { u, co, j, app }
}

describe('documents queries', () => {
  it('create inserts and scopes by userId', async () => {
    const { u, app } = await seedApp()
    const doc = await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'CV — Engineer',
      content: { basics: { name: 'A', headline: 'H' } },
    })
    expect(doc.userId).toBe(u.id)
    expect(doc.kind).toBe('tailored_cv')
    expect(doc.version).toBe(1)
  })

  it('list scopes by userId and filters by applicationId and kind', async () => {
    const { u, app } = await seedApp()
    await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'CV',
      content: {},
    })
    await q.create(u.id, {
      applicationId: app.id,
      kind: 'cover_letter',
      version: 1,
      title: 'CL',
      content: {},
    })
    await q.create(u.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'Master',
      content: {},
    })
    const all = await q.list(u.id)
    expect(all).toHaveLength(3)
    const byApp = await q.list(u.id, { applicationId: app.id })
    expect(byApp).toHaveLength(2)
    const byKind = await q.list(u.id, { kind: 'master_cv' })
    expect(byKind).toHaveLength(1)
    // Other user isolation
    const other = await makeUser('other-doc@x.com')
    expect(await q.list(other.id)).toHaveLength(0)
  })

  it('getById returns null for missing / other-user docs', async () => {
    const { u, app } = await seedApp()
    const doc = await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'CV',
      content: {},
    })
    expect((await q.getById(u.id, doc.id))?.id).toBe(doc.id)
    const other = await makeUser('other-doc2@x.com')
    expect(await q.getById(other.id, doc.id)).toBeNull()
  })

  it('update patches fields and updatedAt', async () => {
    const { u, app } = await seedApp()
    const doc = await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'CV',
      content: {},
    })
    const updated = await q.update(u.id, doc.id, { title: 'CV v2' })
    expect(updated?.title).toBe('CV v2')
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(doc.updatedAt.getTime())
  })

  it('remove deletes only the owner\'s doc', async () => {
    const { u, app } = await seedApp()
    const doc = await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'CV',
      content: {},
    })
    await q.remove(u.id, doc.id)
    expect(await q.getById(u.id, doc.id)).toBeNull()
  })

  it('nextVersion increments per (userId, applicationId, kind)', async () => {
    const { u, app } = await seedApp()
    expect(await q.nextVersion(u.id, app.id, 'tailored_cv')).toBe(1)
    await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'v1',
      content: {},
    })
    expect(await q.nextVersion(u.id, app.id, 'tailored_cv')).toBe(2)
    await q.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 2,
      title: 'v2',
      content: {},
    })
    expect(await q.nextVersion(u.id, app.id, 'tailored_cv')).toBe(3)
    // Different kind → resets
    expect(await q.nextVersion(u.id, app.id, 'cover_letter')).toBe(1)
    // Different app → resets
    expect(await q.nextVersion(u.id, null, 'tailored_cv')).toBe(1)
  })

  it('nextVersion handles master_cv (applicationId null) correctly', async () => {
    const u = await makeUser('master@x.com')
    expect(await q.nextVersion(u.id, null, 'master_cv')).toBe(1)
    await q.create(u.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'Master',
      content: {},
    })
    expect(await q.nextVersion(u.id, null, 'master_cv')).toBe(2)
  })
})
