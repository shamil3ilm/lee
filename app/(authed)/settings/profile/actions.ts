'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import { importProfile } from '@/lib/profile/importer'
import { getAIProviderForUser, findModel } from '@/lib/ai'
import { withAiUsage } from '@/lib/ai/usage'
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
  acceptRelocation: z.string().optional(),
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
    acceptRelocation: formData.get('acceptRelocation') ?? undefined,
    compFloorAnnual: formData.get('compFloorAnnual') ?? undefined,
    compCurrency: formData.get('compCurrency') ?? undefined,
    timezone: formData.get('timezone') ?? undefined,
  })

  const patch: Partial<NewUserProfile> = {
    headline: scalars.headline || null,
    summaryMd: scalars.summaryMd || null,
    careerNarrativeMd: scalars.careerNarrativeMd || null,
    seniority: scalars.seniority || null,
    yearsExperience:
      typeof scalars.yearsExperience === 'number' ? scalars.yearsExperience : null,
    remotePref: scalars.remotePref || 'any',
    acceptRelocation: scalars.acceptRelocation === 'on',
    compFloorAnnual:
      typeof scalars.compFloorAnnual === 'number' ? scalars.compFloorAnnual : null,
    compCurrency: scalars.compCurrency || null,
    // Only overwrite when the form actually sent a non-empty tz — omitting
    // keeps the existing default without null-out risk.
    ...(scalars.timezone ? { timezone: scalars.timezone } : {}),
    skills: csvToArray(formData.get('skills')),
    industries: csvToArray(formData.get('industries')),
    roleTypes: csvToArray(formData.get('roleTypes')),
    employmentTypes: csvToArray(formData.get('employmentTypes')),
    willingToRelocateTo: csvToArray(formData.get('willingToRelocateTo')),
    mustHaves: csvToArray(formData.get('mustHaves')),
    dealbreakers: csvToArray(formData.get('dealbreakers')),
    keywords: csvToArray(formData.get('keywords')),
    stackWeights: parseJsonField(formData.get('stackWeights'), {}) as NewUserProfile['stackWeights'],
    companySizeWeights: parseJsonField(
      formData.get('companySizeWeights'),
      {},
    ) as NewUserProfile['companySizeWeights'],
    benefitPrefs: parseJsonField(formData.get('benefitPrefs'), {}) as NewUserProfile['benefitPrefs'],
    locationPrefs: parseJsonField(
      formData.get('locationPrefs'),
      [],
    ) as NewUserProfile['locationPrefs'],
  }

  await saveProfile(userId, patch)
  revalidatePath('/settings/profile')
  return { success: true }
  } catch (err) {
    logger.error('saveProfile failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save profile.' }
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (name.endsWith('.pdf')) {
    // unpdf is designed for serverless / edge — no fs, no worker file, no
    // module-load-time file reads (pdf-parse's failure mode on Vercel).
    const { extractText, getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(bytes)
    const { text } = await extractText(doc, { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : (text as string)
  }
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth')
    const result = await mod.extractRawText({ buffer: Buffer.from(bytes) })
    return result.value
  }
  // .md / .txt / anything else — treat as utf-8 text
  return new TextDecoder('utf-8').decode(bytes)
}

export async function importProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()

    const cvFile = formData.get('cv')
    const mdFile = formData.get('profile_md')

    let cvText: string | undefined
    let profileMd: string | undefined

    if (cvFile instanceof File && cvFile.size > 0) {
      cvText = await extractTextFromFile(cvFile)
    }
    if (mdFile instanceof File && mdFile.size > 0) {
      profileMd = await extractTextFromFile(mdFile)
    }

    if (!cvText && !profileMd) {
      return { error: 'Provide a CV or profile markdown file to import.' }
    }

    const ai = await getAIProviderForUser(userId)
    // Scoped so the parse call's log row is attributed to the user.
    await withAiUsage({ userId }, () => importProfile({ userId, cvText, profileMd, ai }))
    revalidatePath('/settings/profile')
    return { success: true }
  } catch (err) {
    logger.error('importProfile failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not import profile.' }
  }
}

const decisionProviderSchema = z.object({
  provider: z.enum(['', 'groq', 'heuristic', 'laya']),
  // Accept empty string OR a valid URL. Non-laya providers ignore this field
  // server-side; we still validate to reject junk payloads.
  layaEndpoint: z
    .string()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\//.test(v), {
      message: 'Laya endpoint must be a http(s) URL',
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
