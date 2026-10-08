'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { logger } from '@/lib/logger'
import { PORTFOLIO_TOKEN_ID, publishConfigSchema, toTarget } from '@/lib/portfolio/config'
import { parseChoices } from '@/lib/portfolio/diff'
import { GitHubError } from '@/lib/portfolio/github'
import { publishProfile, type PublishOutcome } from '@/lib/portfolio/publish'
import { checkPortfolioToken, type TokenCheckResult } from '@/lib/portfolio/token-check'
import { publishVariant, unpublishVariant, type VariantPublishOutcome, type VariantUnpublishOutcome } from '@/lib/portfolio/variant-publish'
import { VariantError } from '@/lib/variants/service'
import { ResumeValidationError } from '@/lib/resume/service'
import { resolveServiceSecret } from '@/lib/settings/secrets'

type Result<T = object> = ({ success: true } & T) | { error: string }

const PATH = '/settings/publish'

function fail(what: string, err: unknown): { error: string } {
  if (err instanceof GitHubError || err instanceof ResumeValidationError || err instanceof VariantError) return { error: err.message }
  // Never the token or file content: only the error class/message of lee's own code.
  logger.error(`${what} failed`, { err: err instanceof Error ? err.name : 'unknown' })
  return { error: 'Something went wrong. Please try again.' }
}

export async function savePublishConfigAction(input: unknown): Promise<Result> {
  try {
    const userId = await requireUserId()
    const parsed = publishConfigSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid settings.' }
    await publishQ.saveConfig(userId, parsed.data)
    revalidatePath(PATH)
    return { success: true }
  } catch (err) {
    return fail('savePublishConfig', err)
  }
}

const tokenSchema = z
  .string()
  .trim()
  .min(20, 'That does not look like a GitHub token.')
  .max(400, 'That does not look like a GitHub token.')
  .regex(/^[A-Za-z0-9_]+$/, 'A GitHub token has only letters, digits and underscores.')

async function configuredTarget(userId: string) {
  const row = await publishQ.get(userId)
  const parsed = row ? publishConfigSchema.safeParse(row) : null
  return parsed?.success ? toTarget(parsed.data) : null
}

/** Save the token (encrypted). Checked first when the repo is set: a token GitHub rejects is not stored. */
export async function savePortfolioTokenAction(token: string): Promise<Result<{ last4: string; check: TokenCheckResult | null }>> {
  const ok = tokenSchema.safeParse(token)
  if (!ok.success) return { error: ok.error.issues[0]?.message ?? 'Invalid token.' }
  try {
    const userId = await requireUserId()
    const target = await configuredTarget(userId)
    const check = target ? await checkPortfolioToken(target, ok.data) : null
    const repoStep = check?.steps.find((s) => s.label === 'Repository access')
    if (repoStep && !repoStep.ok) return { error: repoStep.detail }
    const saved = await keysQ.upsert(userId, PORTFOLIO_TOKEN_ID, ok.data)
    revalidatePath(PATH)
    return { success: true, last4: saved.last4, check }
  } catch (err) {
    return fail('savePortfolioToken', err)
  }
}

export async function removePortfolioTokenAction(): Promise<Result> {
  try {
    const userId = await requireUserId()
    await keysQ.remove(userId, PORTFOLIO_TOKEN_ID)
    revalidatePath(PATH)
    return { success: true }
  } catch (err) {
    return fail('removePortfolioToken', err)
  }
}

export async function testPortfolioTokenAction(): Promise<Result<{ check: TokenCheckResult }>> {
  try {
    const userId = await requireUserId()
    const target = await configuredTarget(userId)
    if (!target) return { error: 'Set the repository, branch and path first.' }
    const { key } = await resolveServiceSecret(userId, PORTFOLIO_TOKEN_ID)
    if (!key) return { error: 'Save a token first.' }
    return { success: true, check: await checkPortfolioToken(target, key) }
  } catch (err) {
    return fail('testPortfolioToken', err)
  }
}

export async function publishAction(): Promise<Result<{ outcome: PublishOutcome }>> {
  try {
    const userId = await requireUserId()
    const outcome = await publishProfile(userId)
    revalidatePath(PATH)
    return { success: true, outcome }
  } catch (err) {
    return fail('publishProfile', err)
  }
}

const resolutionSchema = z.object({ repoSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(), choices: z.unknown() })

/** Publish after the user chose a side per section (repo or lee). */
export async function resolveConflictAction(input: unknown): Promise<Result<{ outcome: PublishOutcome }>> {
  try {
    const userId = await requireUserId()
    const parsed = resolutionSchema.safeParse(input)
    if (!parsed.success) return { error: 'Invalid choice.' }
    const outcome = await publishProfile(userId, { resolution: { repoSha: parsed.data.repoSha, choices: parseChoices(parsed.data.choices) } })
    revalidatePath(PATH)
    revalidatePath('/settings/resume')
    return { success: true, outcome }
  } catch (err) {
    return fail('resolvePublishConflict', err)
  }
}

const variantIdSchema = z.guid()
const overwriteSchema = z.object({ overwriteSha: z.string().regex(/^[0-9a-f]{40}$/).nullable() }).optional()

function revalidateVariant(variantId: string): void {
  revalidatePath(PATH)
  revalidatePath(`/settings/variants/${variantId}`)
}

/** Publish one variant as variants/<slug>.json; `overwrite` confirms replacing a hand-edited file. */
export async function publishVariantAction(variantId: string, overwrite?: unknown): Promise<Result<{ outcome: VariantPublishOutcome }>> {
  try {
    const userId = await requireUserId()
    if (!variantIdSchema.safeParse(variantId).success) return { error: 'Variant not found.' }
    const o = overwriteSchema.safeParse(overwrite)
    if (!o.success) return { error: 'Invalid choice.' }
    const outcome = await publishVariant(userId, variantId, o.data ? { overwriteSha: o.data.overwriteSha } : {})
    revalidateVariant(variantId)
    return { success: true, outcome }
  } catch (err) {
    return fail('publishVariant', err)
  }
}

/** Delete variants/<slug>.json from the repo (the UI confirmed it) and turn the toggle off. */
export async function unpublishVariantAction(variantId: string): Promise<Result<{ outcome: VariantUnpublishOutcome }>> {
  try {
    const userId = await requireUserId()
    if (!variantIdSchema.safeParse(variantId).success) return { error: 'Variant not found.' }
    const outcome = await unpublishVariant(userId, variantId)
    revalidateVariant(variantId)
    return { success: true, outcome }
  } catch (err) {
    return fail('unpublishVariant', err)
  }
}
