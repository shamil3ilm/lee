'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import { importProfile } from '@/lib/profile/importer'
import { getAIProvider } from '@/lib/ai'
import type { NewUserProfile } from '@/lib/db/queries/profile'

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
})

export async function saveProfileAction(formData: FormData): Promise<void> {
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
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (name.endsWith('.pdf')) {
    const mod = await import('pdf-parse')
    const pdfParse = (mod as unknown as { default: (b: Buffer | Uint8Array) => Promise<{ text: string }> })
      .default
    const result = await pdfParse(Buffer.from(bytes))
    return result.text
  }
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth')
    const result = await mod.extractRawText({ buffer: Buffer.from(bytes) })
    return result.value
  }
  // .md / .txt / anything else — treat as utf-8 text
  return new TextDecoder('utf-8').decode(bytes)
}

export async function importProfileAction(formData: FormData): Promise<void> {
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
    throw new Error('Provide a CV or profile markdown file to import.')
  }

  await importProfile({ userId, cvText, profileMd, ai: getAIProvider() })
  revalidatePath('/settings/profile')
}
