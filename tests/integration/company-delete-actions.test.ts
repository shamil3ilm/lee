import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companies, contacts } from '@/lib/db/schema'
import { deleteCompany } from '@/app/(authed)/companies/[id]/actions'
import { makeUser, makeCompany, makeContact, makeJob, makeApplication } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
const redirectMock = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  }),
)
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

beforeEach(() => {
  sessionMock.mockReset()
  redirectMock.mockClear()
})

describe('deleteCompany', () => {
  it('is blocked while applications point at the company', async () => {
    const me = await makeUser()
    const co = await makeCompany(me.id)
    const j = await makeJob(me.id, co.id)
    await makeApplication(me.id, j.id)
    await makeApplication(me.id, (await makeJob(me.id, co.id)).id)
    sessionMock.mockResolvedValue(me.id)

    const r = await deleteCompany(co.id)
    expect(r).toEqual({
      error:
        'This company has 2 applications. Move them to another company (Edit details on the application) or delete them first.',
    })
    expect(await db.select().from(companies).where(eq(companies.id, co.id))).toHaveLength(1)
  })

  it('deletes a company without applications and unlinks its contacts', async () => {
    const me = await makeUser()
    const co = await makeCompany(me.id)
    const c = await makeContact(me.id, { companyId: co.id })
    await makeJob(me.id, co.id) // a job with no application does not block
    sessionMock.mockResolvedValue(me.id)

    await expect(deleteCompany(co.id)).rejects.toThrow('NEXT_REDIRECT:/companies')
    expect(await db.select().from(companies).where(eq(companies.id, co.id))).toHaveLength(0)
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, c.id))
    expect(contact?.companyId).toBeNull()
  })

  it("cannot delete another user's company", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeCompany(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await deleteCompany(theirs.id)).toEqual({ error: 'Company not found.' })
    expect(await db.select().from(companies).where(eq(companies.id, theirs.id))).toHaveLength(1)
  })
})
