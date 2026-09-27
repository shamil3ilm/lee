'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as settingsQ from '@/lib/db/queries/reputationSettings'
import { PLACES_HARD_MONTHLY_CAP } from '@/lib/reputation/places'
import { logger } from '@/lib/logger'

export type PlacesSettingsResult = { success: true } | { error: string }

const schema = z.object({
  enabled: z.boolean(),
  cap: z.number().int().min(0).max(PLACES_HARD_MONTHLY_CAP),
})

/** Google Places for company reputation: on/off and the monthly call cap (≤ hard cap). */
export async function savePlacesSettingsAction(enabled: boolean, cap: number): Promise<PlacesSettingsResult> {
  const parsed = schema.safeParse({ enabled, cap })
  if (!parsed.success) return { error: `The cap must be a whole number from 0 to ${PLACES_HARD_MONTHLY_CAP}.` }
  try {
    const userId = await requireUserId()
    await settingsQ.savePlaces(userId, { placesEnabled: parsed.data.enabled, placesMonthlyCap: parsed.data.cap })
    revalidatePath('/settings/integrations')
    return { success: true }
  } catch (err) {
    logger.error('savePlacesSettings failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save the Google Places settings.' }
  }
}
