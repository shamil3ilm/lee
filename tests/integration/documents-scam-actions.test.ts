import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { documents, scamAllowList } from '@/lib/db/schema'
import { renameDocument } from '@/app/(authed)/documents/actions'
import { addAllowListEntryAction } from '@/app/(authed)/settings/scam-shield/actions'
import { makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

beforeEach(() => sessionMock.mockReset())

async function makeDoc(userId: string) {
  const [row] = await db
    .insert(documents)
    .values({ userId, kind: 'master_cv', title: 'Old title', content: { a: 1 } })
    .returning()
  return row!
}

describe('renameDocument', () => {
  it('renames without touching content or updated_at', async () => {
    const me = await makeUser()
    const doc = await makeDoc(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await renameDocument(doc.id, '  CV — 2026  ')).toEqual({ success: true })
    const [row] = await db.select().from(documents).where(eq(documents.id, doc.id))
    expect(row?.title).toBe('CV — 2026')
    expect(row?.content).toEqual({ a: 1 })
    expect(row?.updatedAt.getTime()).toBe(doc.updatedAt.getTime())
  })

  it('rejects a blank title', async () => {
    const me = await makeUser()
    const doc = await makeDoc(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await renameDocument(doc.id, '   ')).toEqual({ error: 'Title is required' })
  })

  it("cannot rename another user's document", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeDoc(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await renameDocument(theirs.id, 'Mine')).toEqual({ error: 'Document not found.' })
    expect(await renameDocument('nope', 'Mine')).toEqual({ error: 'Document not found.' })
    const [row] = await db.select().from(documents).where(eq(documents.id, theirs.id))
    expect(row?.title).toBe('Old title')
  })
})

describe('addAllowListEntryAction', () => {
  it('normalises domains and company names the way verdicts store them', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await addAllowListEntryAction('domain', 'https://careers.Acme.com/jobs/1')).toEqual({
      success: true,
    })
    expect(await addAllowListEntryAction('company', 'Acme Technologies Pvt. Ltd.')).toEqual({
      success: true,
    })
    const rows = await db.select().from(scamAllowList).where(eq(scamAllowList.userId, me.id))
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.value]))
    expect(byKind.domain).toBe('acme.com')
    expect(byKind.company).toMatch(/^acme/)
  })

  it('refuses shared hosts and junk', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await addAllowListEntryAction('domain', 'gmail.com')).toHaveProperty('error')
    expect(await addAllowListEntryAction('domain', 'linkedin.com')).toHaveProperty('error')
    expect(await addAllowListEntryAction('domain', 'not a domain')).toEqual({
      error: 'Enter a domain like acme.com.',
    })
    expect(await addAllowListEntryAction('ip', 'x')).toEqual({ error: 'Invalid entry type.' })
    const rows = await db.select().from(scamAllowList).where(eq(scamAllowList.userId, me.id))
    expect(rows).toHaveLength(0)
  })

  it("entries are scoped to the caller (another user's list is untouched)", async () => {
    const me = await makeUser()
    const other = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    await addAllowListEntryAction('domain', 'acme.com')
    const theirs = await db.select().from(scamAllowList).where(eq(scamAllowList.userId, other.id))
    expect(theirs).toHaveLength(0)
  })
})
