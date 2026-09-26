'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as profileQ from '@/lib/db/queries/profile'
import { checkServiceKey, testServiceSecret } from '@/lib/settings/secrets'
import { SERVICE_SECRET_IDS } from '@/lib/settings/service-secrets'
import { logger } from '@/lib/logger'

export type SaveSecretResult =
  | { success: true; last4: string; verified: boolean; warning: string | null }
  | { error: string }
export type ActionResult = { success: true } | { error: string }
export type TestResult = { ok: boolean; error: string | null }

const idSchema = z.enum(SERVICE_SECRET_IDS)
const keySchema = z
  .string()
  .trim()
  .min(8, 'Key looks too short')
  .max(512, 'Key looks too long')
  .regex(/^\S+$/, 'Key must not contain spaces')

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Save a service key (Firecrawl, Laya) for the signed-in user. It is checked
 * against the service first: a key the service rejects is not stored. When
 * the service can't be reached the key is still saved, with a warning, so a
 * provider outage never blocks setup.
 */
export async function saveServiceSecretAction(id: string, key: string): Promise<SaveSecretResult> {
  const idOk = idSchema.safeParse(id)
  if (!idOk.success) return { error: 'Unknown setting.' }
  const keyOk = keySchema.safeParse(key)
  if (!keyOk.success) return { error: keyOk.error.issues[0]?.message ?? 'Invalid key.' }
  try {
    const userId = await requireUserId()
    const layaEndpoint =
      idOk.data === 'laya'
        ? ((await profileQ.get(userId))?.layaEndpoint ?? process.env.LAYA_ENDPOINT ?? null)
        : null
    const check = await checkServiceKey(idOk.data, keyOk.data, { layaEndpoint })
    if (check.rejected) return { error: check.error ?? 'The service rejected this key.' }
    const saved = await keysQ.upsert(userId, idOk.data, keyOk.data)
    revalidatePath('/settings/ai')
    return {
      success: true,
      last4: saved.last4,
      verified: check.ok,
      warning: check.ok ? null : `Saved, but not verified: ${check.error ?? 'no answer'}`,
    }
  } catch (err) {
    logger.error('saveServiceSecret failed', { id, err: errMessage(err) })
    return { error: 'Could not save the key.' }
  }
}

/** Forget the saved key; the env default (if any) takes over again. */
export async function removeServiceSecretAction(id: string): Promise<ActionResult> {
  const idOk = idSchema.safeParse(id)
  if (!idOk.success) return { error: 'Unknown setting.' }
  try {
    const userId = await requireUserId()
    await keysQ.remove(userId, idOk.data)
    revalidatePath('/settings/ai')
    return { success: true }
  } catch (err) {
    logger.error('removeServiceSecret failed', { id, err: errMessage(err) })
    return { error: 'Could not remove the key.' }
  }
}

/** "Test" button: checks whichever key is in effect (saved, else env). */
export async function testServiceSecretAction(id: string): Promise<TestResult> {
  const idOk = idSchema.safeParse(id)
  if (!idOk.success) return { ok: false, error: 'Unknown setting.' }
  try {
    const userId = await requireUserId()
    const r = await testServiceSecret(userId, idOk.data)
    return { ok: r.ok, error: r.error }
  } catch (err) {
    logger.error('testServiceSecret failed', { id, err: errMessage(err) })
    return { ok: false, error: 'Could not run the test.' }
  }
}
