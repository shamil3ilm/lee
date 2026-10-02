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
import {
  applyImport,
  extractPageSections,
  IMPORT_SECTIONS,
  proposeImport,
  type ImportProposal,
  type ImportSection,
} from '@/lib/profile/url-import'
import { queueRelevanceReevaluation } from '@/lib/discovery/relevance/enqueue'
import { reevaluateRelevance } from '@/lib/discovery/relevance/service'
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
  | { success: true; proposal: ImportProposal; aiUsed: boolean }
  | { error: string }

/** Text sent to the AI parse (the same parse as CV import). */
const AI_TEXT_CAP = 8_000

/**
 * Fetch a public résumé/portfolio page server-side (SSRF-safe: https only,
 * no private hosts, 2 MB cap, 10 s timeout, every redirect re-checked),
 * strip scripts and styles, and propose per-section changes. Nothing is
 * saved here. The AI parse is optional: without a key the proposal uses
 * the deterministic sections and domain terms only.
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
    const profile = await profileQ.get(userId)
    return { success: true, proposal: proposeImport({ url: rawUrl.trim(), profile, sections, parsed }), aiUsed: parsed !== null }
  } catch (err) {
    logger.error('previewUrlImport failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not import that page.' }
  }
}

const item = z.string().max(300)
const proposalSchema = z.object({
  url: z.string().url().max(500),
  skills: z.object({ add: z.array(z.string().max(80)).max(40), current: z.array(z.string()).max(200) }),
  headline: z.object({ from: z.string().nullable(), to: z.string().max(300) }).nullable(),
  summary: z.object({ from: z.string().nullable(), to: z.string().max(4_000) }).nullable(),
  experience: z.object({ add: z.array(item).max(40) }),
  projects: z.object({ add: z.array(item).max(40) }),
  metrics: z.object({ add: z.array(item).max(40) }),
  text: z.string().max(12_000),
})

/** Save the sections the user ticked; the rest of the proposal is discarded. */
export async function applyUrlImportAction(proposal: unknown, sections: unknown): Promise<LinksResult> {
  try {
    const userId = await requireUserId()
    const p = proposalSchema.safeParse(proposal)
    const s = z.array(z.enum(IMPORT_SECTIONS)).max(IMPORT_SECTIONS.length).safeParse(sections)
    if (!p.success || !s.success) return { error: 'Nothing to save.' }
    const profile = await profileQ.get(userId)
    const patch = applyImport(profile, p.data, new Set<ImportSection>(s.data))
    if (Object.keys(patch).length === 0) return { success: true }
    await saveProfile(userId, patch)
    // New skills can change relevance (e.g. infrastructure experience).
    const r = await reevaluateRelevance(userId, { deadline: Date.now() + 3_000 })
    if (r.remaining) await queueRelevanceReevaluation(userId)
    revalidatePath('/settings/profile')
    revalidatePath('/discoveries')
    return { success: true }
  } catch (err) {
    logger.error('applyUrlImport failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save the imported sections.' }
  }
}
