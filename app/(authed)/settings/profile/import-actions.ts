'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { withAiUsage } from '@/lib/ai/usage'
import type { ParsedProfile } from '@/lib/ai/types'
import * as profileQ from '@/lib/db/queries/profile'
import { fetchPage } from '@/lib/ingest/fetch'
import { saveProfile } from '@/lib/profile/service'
import { MAX_LINKS, profileLinkSchema } from '@/lib/profile/links'
import { detectTerms, extractPageSections, readLinkedProfile } from '@/lib/profile/url-import'
import { buildUrlImportItems, pageSkillGroup, proposalFrom, urlProposalSchema, type UrlImportContext, type UrlProposal } from '@/lib/profile/url-import-review'
import { applyUrlSelection } from '@/lib/profile/url-import-apply'
import { canEditPublicFacts } from '@/lib/portfolio/lock'
import { readProfileLinks } from '@/lib/profile/links'
import { cleanSelection } from '@/lib/import/selection'
import { commitImport, portfolioProfileUrl } from '@/lib/import/service'
import { suggestionSnippets, type ImportApplyResult } from '@/lib/import/result'
import type { ImportItem } from '@/lib/import/types'
import { getResumeProfile, ResumeValidationError } from '@/lib/resume/service'
import { logger } from '@/lib/logger'

export type LinksResult = { success: true } | { error: string }

/** Save the labelled profile links (portfolio, case studies, GitHub, …). */
export async function saveProfileLinksAction(links: unknown): Promise<LinksResult> {
  try {
    const userId = await requireUserId()
    const parsed = z.array(profileLinkSchema).max(MAX_LINKS).safeParse(links)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the links and try again.' }
    await saveProfile(userId, { links: parsed.data })
    revalidatePath('/settings/profile')
    return { success: true }
  } catch (err) {
    logger.error('saveProfileLinks failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save your links.' }
  }
}

export type PreviewResult =
  | { success: true; proposal: UrlProposal; items: ImportItem[]; aiUsed: boolean; editable: boolean }
  | { error: string }

/** Text sent to the AI parse (the same parse as CV import). */
const AI_TEXT_CAP = 8_000

async function importContext(userId: string): Promise<UrlImportContext> {
  const [row, { profile: resume }] = await Promise.all([profileQ.get(userId), getResumeProfile(userId)])
  return {
    headline: row?.headline ?? null,
    summaryMd: row?.summaryMd ?? null,
    skills: row?.skills ?? [],
    resume,
    links: readProfileLinks(row?.links),
    linked: readLinkedProfile(row?.linkedProfile),
  }
}

/**
 * Fetch a public résumé/portfolio page server-side (SSRF-safe: https only,
 * no private hosts, 2 MB cap, 10 s timeout, every redirect re-checked),
 * strip scripts and styles, and propose items to review. Nothing is saved
 * here. The AI parse is optional: without a key the proposal uses the
 * deterministic sections and domain terms only.
 */
export async function previewUrlImportAction(rawUrl: string): Promise<PreviewResult> {
  try {
    const userId = await requireUserId()
    if (typeof rawUrl !== 'string' || rawUrl.length > 500) return { error: 'Enter a page URL.' }
    let html: string
    try {
      html = (await fetchPage(rawUrl.trim())).html
    } catch (err) {
      logger.warn('url_import_fetch_failed', { err: err instanceof Error ? err.message : String(err) })
      return { error: 'Could not read that page. Use a public https:// address.' }
    }
    const sections = extractPageSections(html)
    if (sections.text.length < 100) return { error: 'That page has too little text to import.' }
    let parsed: ParsedProfile | null = null
    try {
      const ai = await getAIProviderForUser(userId)
      const { result } = await withAiUsage({ userId }, () =>
        ai.parseProfile({ profileMd: sections.text.slice(0, AI_TEXT_CAP) }, { userId }),
      )
      parsed = result
    } catch (err) {
      logger.warn('url_import_ai_skipped', { err: err instanceof Error ? err.message : String(err) })
    }
    const proposal = proposalFrom(rawUrl.trim(), sections, parsed, detectTerms(sections.text))
    const items = buildUrlImportItems(proposal, await importContext(userId))
    return { success: true, proposal, items, aiUsed: parsed !== null, editable: await canEditPublicFacts(userId) }
  } catch (err) {
    logger.error('previewUrlImport failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not import that page.' }
  }
}

/**
 * Apply the ticked items. The items are rebuilt here from the proposal and
 * the current profile (never trusted from the client). Public facts are
 * written only while profile editing in lee is on; otherwise they come back
 * as suggestions for the portfolio and the chosen readiness is kept.
 */
export async function applyUrlImportAction(proposal: unknown, selection: unknown): Promise<ImportApplyResult> {
  try {
    const userId = await requireUserId()
    const p = urlProposalSchema.safeParse(proposal)
    if (!p.success) return { ok: false, error: 'Nothing to save.' }
    const ctx = await importContext(userId)
    const items = buildUrlImportItems(p.data, ctx)
    const sel = cleanSelection(items, selection)
    if (!sel || sel.picked.length === 0) return { ok: false, error: 'Tick at least one item.' }
    const editable = await canEditPublicFacts(userId)
    const importedAt = new Date()
    const r = applyUrlSelection(ctx, p.data, items, sel, { source: 'url', importedAt: importedAt.toISOString() }, editable)
    const batch = await commitImport(userId, { source: 'url', editable, importedAt, ...r })
    revalidatePath('/settings/profile')
    revalidatePath('/settings/resume')
    revalidatePath('/discoveries')
    return {
      ok: true,
      mode: batch.mode === 'saved' ? 'saved' : 'suggested',
      batchId: batch.id,
      saved: editable ? sel.picked.length : sel.picked.filter((k) => items.some((i) => i.key === k && !i.isPublic)).length,
      snippets: editable ? [] : suggestionSnippets(items, sel, pageSkillGroup(p.data.url)),
      profileUrl: editable ? null : await portfolioProfileUrl(userId),
    }
  } catch (err) {
    if (err instanceof ResumeValidationError) return { ok: false, error: err.message }
    logger.error('applyUrlImport failed', { err: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: 'Could not save the imported items.' }
  }
}
