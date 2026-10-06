'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { withAiUsage } from '@/lib/ai/usage'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { logger } from '@/lib/logger'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { addWording } from '@/lib/resume/wordings'
import { ensureVariantDocument, saveVariantPdfToDrive, scoreVariant } from '@/lib/variants/outputs'
import { filterProposal, itemsForAi, type FilteredProposal } from '@/lib/variants/proposals'
import { chooseVariantForApplication, createVariant, loadVariant, saveRecipe, VariantError } from '@/lib/variants/service'
import { REGIONS, type Recipe } from '@/lib/variants/types'
import { applyProposalToRecipe } from '@/lib/variants/apply-proposal'
import type { Highlight, ResumeProfile } from '@/lib/resume/types'

type Result<T = object> = ({ success: true } & T) | { error: string }

function fail(what: string, err: unknown): { error: string } {
  if (err instanceof VariantError || err instanceof ResumeValidationError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: 'Something went wrong. Please try again.' }
}

function revalidate(id?: string): void {
  revalidatePath('/settings/profile/variants')
  if (id) revalidatePath(`/settings/profile/variants/${id}`)
}

const createSchema = z.object({
  region: z.enum(REGIONS),
  roleFamily: z.string().max(40).optional().default(''),
  lengthTarget: z.coerce.number().int().min(1).max(2).default(1),
  name: z.string().max(120).optional().default(''),
})

export async function createVariantAction(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const userId = await requireUserId()
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) return { error: 'Pick a region.' }
    const { region, roleFamily, lengthTarget, name } = parsed.data
    const v = await createVariant(userId, { region, roleFamily: roleFamily || null, lengthTarget: lengthTarget as 1 | 2, name })
    revalidate()
    return { success: true, id: v.id }
  } catch (err) {
    return fail('createVariant', err)
  }
}

const metaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  publishToPortfolio: z.boolean(),
})

/** Save the recipe (new version only when it changed) and the name / portfolio toggle. */
export async function saveVariantAction(
  variantId: string,
  recipe: unknown,
  meta: unknown,
): Promise<Result<{ version: number; changed: boolean }>> {
  try {
    const userId = await requireUserId()
    const m = metaSchema.safeParse(meta)
    if (!m.success) return { error: 'Give the variant a name.' }
    const { variant, changed } = await saveRecipe(userId, variantId, recipe)
    await variantsQ.updateMeta(userId, variantId, { name: m.data.name, publishToPortfolio: m.data.publishToPortfolio })
    revalidate(variantId)
    return { success: true, version: variant.currentVersion, changed }
  } catch (err) {
    return fail('saveVariant', err)
  }
}

export async function archiveVariantAction(variantId: string): Promise<Result> {
  try {
    const userId = await requireUserId()
    await variantsQ.updateMeta(userId, variantId, { archivedAt: new Date() })
    revalidate(variantId)
    return { success: true }
  } catch (err) {
    return fail('archiveVariant', err)
  }
}

export async function variantDocumentAction(variantId: string): Promise<Result<{ documentId: string }>> {
  try {
    const userId = await requireUserId()
    const doc = await ensureVariantDocument(userId, variantId)
    revalidatePath('/documents')
    return { success: true, documentId: doc.id }
  } catch (err) {
    return fail('variantDocument', err)
  }
}

export async function variantDriveAction(variantId: string): Promise<Result<{ driveFileId: string }>> {
  try {
    const userId = await requireUserId()
    const r = await saveVariantPdfToDrive(userId, variantId)
    return r.saved ? { success: true, driveFileId: r.driveFileId } : { error: r.error }
  } catch (err) {
    return fail('variantDrive', err)
  }
}

export async function scoreVariantAction(variantId: string): Promise<Result<{ score: number | null; grade: string | null }>> {
  try {
    const userId = await requireUserId()
    const ai = await getAIProviderForUser(userId)
    const { result } = await withAiUsage({ userId }, () => scoreVariant(userId, variantId, { ai }))
    return { success: true, score: result.total.score, grade: result.total.grade }
  } catch (err) {
    return fail('scoreVariant', err)
  }
}

/** AI proposal for this variant, already filtered through readiness and the fact lock. */
export async function proposeVariantAction(variantId: string): Promise<Result<{ proposal: FilteredProposal }>> {
  try {
    const userId = await requireUserId()
    const [{ profile }, loaded] = await Promise.all([getResumeProfile(userId), loadVariant(userId, variantId)])
    const items = itemsForAi(profile)
    const ai = await getAIProviderForUser(userId)
    const { result } = await withAiUsage({ userId }, () =>
      ai.proposeResumeVariant({
        region: loaded.recipe.region,
        roleFamily: loaded.recipe.roleFamily,
        headline: loaded.recipe.headline,
        summary: loaded.recipe.summary,
        items,
      }),
    )
    return { success: true, proposal: filterProposal(profile, items, result) }
  } catch (err) {
    return fail('proposeVariant', err)
  }
}

const acceptSchema = z.object({
  headline: z.string().max(200).nullable(),
  summary: z.string().max(2000).nullable(),
  selectedIds: z.array(z.string()).max(60).nullable(),
  wordings: z.array(z.object({ highlightId: z.string(), text: z.string().max(400) })).max(30),
})

/** The user confirmed (parts of) a proposal: wordings join the master (fact-locked again), the recipe gets a new version. */
export async function acceptProposalAction(variantId: string, accepted: unknown): Promise<Result<{ version: number }>> {
  try {
    const userId = await requireUserId()
    const a = acceptSchema.safeParse(accepted)
    if (!a.success) return { error: 'Invalid selection.' }
    let { profile } = await getResumeProfile(userId)
    const wordingIds = new Map<string, string>()
    for (const w of a.data.wordings) {
      const next = addWordingTo(profile, w.highlightId, w.text)
      if (next) {
        profile = next.profile
        wordingIds.set(w.highlightId, next.wordingId)
      }
    }
    if (wordingIds.size > 0) profile = (await saveResumeProfile(userId, profile)).profile
    const loaded = await loadVariant(userId, variantId)
    const recipe: Recipe = applyProposalToRecipe(profile, loaded.recipe, { ...a.data, wordingIds })
    const { variant } = await saveRecipe(userId, variantId, recipe)
    revalidate(variantId)
    return { success: true, version: variant.currentVersion }
  } catch (err) {
    return fail('acceptProposal', err)
  }
}

function addWordingTo(profile: ResumeProfile, highlightId: string, text: string): { profile: ResumeProfile; wordingId: string } | null {
  let wordingId: string | null = null
  const patch = (h: Highlight): Highlight => {
    if (h.id !== highlightId) return h
    const r = addWording(h, text, 'ai')
    if (!r.ok) return h
    wordingId = r.wording.id
    return r.highlight
  }
  const next: ResumeProfile = {
    ...profile,
    work: profile.work.map((w) => ({ ...w, highlights: w.highlights.map(patch) })),
    projects: profile.projects.map((p) => ({ ...p, highlights: p.highlights.map(patch) })),
  }
  return wordingId ? { profile: next, wordingId } : null
}

/** Application page: use this variant (its current version) for the application. */
export async function chooseVariantAction(applicationId: string, variantId: string | null): Promise<Result<{ version: number | null }>> {
  try {
    const userId = await requireUserId()
    const choice = await chooseVariantForApplication(userId, applicationId, variantId)
    revalidatePath(`/applications/${applicationId}`)
    return { success: true, version: choice?.version ?? null }
  } catch (err) {
    return fail('chooseVariant', err)
  }
}
