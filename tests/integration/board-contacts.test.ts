import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { contacts } from '@/lib/db/schema'
import { moveContact } from '@/app/(authed)/contacts/actions'
import { contactStageOf, storedContactStage } from '@/lib/contacts/pipeline'
import { makeUser, makeContact } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function stageOf(id: string): Promise<string | null | undefined> {
  const [r] = await db.select({ s: contacts.pipelineStage }).from(contacts).where(eq(contacts.id, id))
  return r?.s
}

beforeEach(() => sessionMock.mockReset())

describe('moveContact (networking board)', () => {
  it('walks a contact through the pipeline; To contact is stored as null', async () => {
    const me = await makeUser()
    const c = await makeContact(me.id, { name: 'Nadia' })
    sessionMock.mockResolvedValue(me.id)
    expect(await stageOf(c.id)).toBeNull()

    for (const stage of ['contacted', 'replied', 'meeting', 'referral'] as const) {
      expect(await moveContact(c.id, stage)).toEqual({ success: true })
      expect(await stageOf(c.id)).toBe(stage)
    }
    expect(await moveContact(c.id, 'to_contact')).toEqual({ success: true })
    expect(await stageOf(c.id)).toBeNull()
  })

  it('rejects unknown stages and bad ids', async () => {
    const me = await makeUser()
    const c = await makeContact(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await moveContact(c.id, 'ghosted')).toEqual({ error: 'Invalid move.' })
    expect(await moveContact('nope', 'replied')).toEqual({ error: 'Invalid move.' })
    expect(await stageOf(c.id)).toBeNull()
  })

  it("cannot move another user's contact", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeContact(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await moveContact(theirs.id, 'meeting')).toEqual({ error: 'Contact not found.' })
    expect(await stageOf(theirs.id)).toBeNull()
  })
})

describe('contact stage mapping', () => {
  it('maps stored values to columns and back', () => {
    expect(contactStageOf(null)).toBe('to_contact')
    expect(contactStageOf('weird')).toBe('to_contact')
    expect(contactStageOf('meeting')).toBe('meeting')
    expect(storedContactStage('to_contact')).toBeNull()
    expect(storedContactStage('referral')).toBe('referral')
  })
})
