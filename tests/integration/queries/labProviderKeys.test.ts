import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { labProviderKeys } from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'

const KEY_A = 'sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaa1111'
const KEY_B = 'sk-or-v1-bbbbbbbbbbbbbbbbbbbbbbbb2222'

describe('labProviderKeys queries', () => {
  it('upsert stores ciphertext only and returns masked info', async () => {
    const u = await makeUser()
    const saved = await keysQ.upsert(u.id, 'openrouter', KEY_A)
    expect(saved).toMatchObject({ provider: 'openrouter', last4: '1111' })
    const [row] = await db.select().from(labProviderKeys).where(eq(labProviderKeys.userId, u.id))
    expect(row?.encryptedKey).toBeTruthy()
    expect(JSON.stringify(row)).not.toContain(KEY_A)
  })

  it('listMasked never contains the secret or ciphertext', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'openrouter', KEY_A)
    await keysQ.upsert(u.id, 'groq', 'gsk_cccccccccccccccccccccccc3333')
    const list = await keysQ.listMasked(u.id)
    expect(list.map((l) => l.provider)).toEqual(['groq', 'openrouter'])
    const blob = JSON.stringify(list)
    expect(blob).not.toContain(KEY_A)
    const [row] = await db.select().from(labProviderKeys).where(eq(labProviderKeys.provider, 'openrouter'))
    expect(blob).not.toContain(row?.encryptedKey ?? 'x')
    for (const item of list) expect(Object.keys(item).sort()).toEqual(['last4', 'provider', 'updatedAt'])
  })

  it('upsert replaces the existing key for the same provider', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'openrouter', KEY_A)
    await keysQ.upsert(u.id, 'openrouter', KEY_B)
    expect(await keysQ.listMasked(u.id)).toHaveLength(1)
    expect(await keysQ.getDecrypted(u.id, 'openrouter')).toBe(KEY_B)
  })

  it('is userId-scoped', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await keysQ.upsert(a.id, 'openrouter', KEY_A)
    expect(await keysQ.getDecrypted(b.id, 'openrouter')).toBeNull()
    expect(await keysQ.listMasked(b.id)).toEqual([])
    expect(await keysQ.remove(b.id, 'openrouter')).toBe(false)
    expect(await keysQ.getDecrypted(a.id, 'openrouter')).toBe(KEY_A)
  })

  it('remove deletes the key', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'openrouter', KEY_A)
    expect(await keysQ.remove(u.id, 'openrouter')).toBe(true)
    expect(await keysQ.getDecrypted(u.id, 'openrouter')).toBeNull()
  })

  it('getDecrypted returns null (not throw) for a tampered row', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'openrouter', KEY_A)
    await db
      .update(labProviderKeys)
      .set({ authTag: Buffer.alloc(16, 1).toString('base64') })
      .where(eq(labProviderKeys.userId, u.id))
    expect(await keysQ.getDecrypted(u.id, 'openrouter')).toBeNull()
  })
})
