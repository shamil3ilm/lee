'use server'
import { assertSafeUrl } from '@/lib/ingest/ssrf'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { refreshMatchesAfterSave } from '@/lib/discovery/match/enqueue'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import { findModel } from '@/lib/ai'
import { logger } from '@/lib/logger'
import type { NewUserProfile } from '@/lib/db/queries/profile'

export type ActionResult = { success: true } | { error: string }

function csvToArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseJsonField(value: FormDataEntryValue | null, fallback: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const scalarSchema = z.object({
  headline: z.string().optional(),
  summaryMd: z.string().optional(),
  careerNarrativeMd: z.string().optional(),
  seniority: z.string().optional(),
  yearsExperience: z.coerce.number().int().nonnegative().optional().or(z.literal('')),
  remotePref: z.string().optional(),
  compFloorAnnual: z.coerce.number().int().nonnegative().optional().or(z.literal('')),
  compCurrency: z.string().optional(),
  timezone: z.string().optional(),
})

export async function saveProfileAction(formData: FormData): Promise<ActionResult> {
  try {
  const userId = await requireUserId()

  const scalars = scalarSchema.parse({
    headline: formData.get('headline') ?? undefined,
    summaryMd: formData.get('summaryMd') ?? undefined,
    careerNarrativeMd: formData.get('careerNarrativeMd') ?? undefined,
    seniority: formData.get('seniority') ?? undefined,
    yearsExperience: formData.get('yearsExperience') ?? undefined,
    remotePref: formData.get('remotePref') ?? undefined,
    compFloorAnnual: formData.get('compFloorAnnual') ?? undefined,
    compCurrency: formData.get('compCurrency') ?? undefined,
    timezone: formData.get('timezone') ?? undefined,
  })

  const patch: Partial<NewUserProfile> = {
    headline: scalars.headline || null,
    summaryMd: scalars.summaryMd || null,
    careerNarrativeMd: scalars.careerNarrativeMd || null,
    // Seniority and work mode are edited in Settings › Search (one place);
    // only an explicit value from an older client overwrites them here.
    ...(scalars.seniority !== undefined ? { seniority: scalars.seniority || null } : {}),
    yearsExperience:
      typeof scalars.yearsExperience === 'number' ? scalars.yearsExperience : null,
    ...(scalars.remotePref !== undefined ? { remotePref: scalars.remotePref || 'any' } : {}),
    compFloorAnnual:
      typeof scalars.compFloorAnnual === 'number' ? scalars.compFloorAnnual : null,
    compCurrency: scalars.compCurrency || null,
    // Only overwrite when the form actually sent a non-empty tz — omitting
    // keeps the existing default without null-out risk.
    ...(scalars.timezone ? { timezone: scalars.timezone } : {}),
    // Target roles, locations, relocation and include/exclude keywords are
    // edited in the Search preferences form (search-actions.ts), which also
    // re-gates Discovery; this form never overwrites them.
    skills: csvToArray(formData.get('skills')),
    industries: csvToArray(formData.get('industries')),
    employmentTypes: csvToArray(formData.get('employmentTypes')),
    mustHaves: csvToArray(formData.get('mustHaves')),
    stackWeights: parseJsonField(formData.get('stackWeights'), {}) as NewUserProfile['stackWeights'],
    companySizeWeights: parseJsonField(
      formData.get('companySizeWeights'),
      {},
    ) as NewUserProfile['companySizeWeights'],
    benefitPrefs: parseJsonField(formData.get('benefitPrefs'), {}) as NewUserProfile['benefitPrefs'],
  }

  await saveProfile(userId, patch)
  // Years, work mode and legacy skills feed the Match Score.
  await refreshMatchesAfterSave(userId)
  revalidatePath('/settings/profile')
  return { success: true }
  } catch (err) {
    logger.error('saveProfile failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save profile.' }
  }
}

function isSafeUrl(v: string): boolean {
  try {
    assertSafeUrl(v)
    return true
  } catch {
    return false
  }
}

const decisionProviderSchema = z.object({
  provider: z.enum(['', 'groq', 'heuristic', 'laya']),
  // Accept empty string OR a valid URL. Non-laya providers ignore this field
  // server-side; we still validate to reject junk payloads.
  layaEndpoint: z
    .string()
    .max(500)
    .refine((v) => v === '' || isSafeUrl(v), {
      // Server-side calls go to this host: public https only (no localhost
      // or private/link-local IPs) so it can't reach internal services.
      message: 'Laya endpoint must be a public https URL',
    }),
})

export async function saveDecisionProviderAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const parsed = decisionProviderSchema.safeParse({
      provider: formData.get('provider') ?? '',
      layaEndpoint: formData.get('layaEndpoint') ?? '',
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid provider payload.' }
    }
    const { provider, layaEndpoint } = parsed.data
    // Empty provider → clear both overrides so we fall through to env.
    const decisionProvider = provider === '' ? null : provider
    // Endpoint only meaningful when provider === 'laya'. Storing an endpoint
    // for a non-laya row is harmless but confusing — clear it.
    const endpointToStore =
      provider === 'laya' ? (layaEndpoint === '' ? null : layaEndpoint) : null
    await saveProfile(userId, { decisionProvider, layaEndpoint: endpointToStore })
    revalidatePath('/settings/ai')
    return { success: true }
  } catch (err) {
    logger.error('saveDecisionProvider failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save decision provider preference.' }
  }
}

export async function saveAiModelAction(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const id = formData.get('modelId')
    if (typeof id !== 'string') return { error: 'Model id is required.' }
    // Empty string clears the pref and falls back to env default.
    if (id === '') {
      await saveProfile(userId, { aiProvider: null, aiModel: null })
    } else {
      const choice = findModel(id)
      if (!choice) return { error: 'Unknown model.' }
      await saveProfile(userId, { aiProvider: choice.provider, aiModel: choice.model })
    }
    revalidatePath('/settings/ai')
    return { success: true }
  } catch (err) {
    logger.error('saveAiModel failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save model preference.' }
  }
}
