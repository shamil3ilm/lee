import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { labProviderKeys } from '@/lib/db/schema'
import { decryptSecret, encryptSecret, last4 } from '@/lib/lab/crypto'

/**
 * v14 — encrypted provider keys. Every function is userId-scoped.
 * `listMasked` is the ONLY read used for anything client-facing and never
 * selects the ciphertext columns. `getDecrypted` is server-only and must not
 * be returned from a route handler.
 */

export interface MaskedProviderKey {
  provider: string
  last4: string
  updatedAt: Date
}

export async function upsert(
  userId: string,
  provider: string,
  plainKey: string,
): Promise<MaskedProviderKey> {
  const enc = encryptSecret(plainKey)
  const tail = last4(plainKey)
  const [row] = await db
    .insert(labProviderKeys)
    .values({
      userId,
      provider,
      encryptedKey: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      keyLast4: tail,
    })
    .onConflictDoUpdate({
      target: [labProviderKeys.userId, labProviderKeys.provider],
      set: {
        encryptedKey: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyLast4: tail,
        updatedAt: sql`now()`,
      },
    })
    .returning()
  if (!row) throw new Error('labProviderKeys.upsert: no row returned')
  return { provider: row.provider, last4: row.keyLast4, updatedAt: row.updatedAt }
}

export async function listMasked(userId: string): Promise<MaskedProviderKey[]> {
  return db
    .select({
      provider: labProviderKeys.provider,
      last4: labProviderKeys.keyLast4,
      updatedAt: labProviderKeys.updatedAt,
    })
    .from(labProviderKeys)
    .where(eq(labProviderKeys.userId, userId))
    .orderBy(asc(labProviderKeys.provider))
}

/** SERVER-ONLY. Returns null when no key is stored (or it fails to decrypt). */
export async function getDecrypted(userId: string, provider: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(labProviderKeys)
    .where(and(eq(labProviderKeys.userId, userId), eq(labProviderKeys.provider, provider)))
    .limit(1)
  if (!row) return null
  try {
    return decryptSecret({ ciphertext: row.encryptedKey, iv: row.iv, authTag: row.authTag })
  } catch {
    // AUTH_SECRET rotated or row tampered — treat as missing, never throw
    // the raw crypto error up to a route.
    return null
  }
}

export async function remove(userId: string, provider: string): Promise<boolean> {
  const rows = await db
    .delete(labProviderKeys)
    .where(and(eq(labProviderKeys.userId, userId), eq(labProviderKeys.provider, provider)))
    .returning()
  return rows.length > 0
}
