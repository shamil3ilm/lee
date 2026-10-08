'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import type { AIProvider } from '@/lib/ai/types'
import { extractOpenings } from '@/lib/discovery/manual-import/extract'
import { importOpenings } from '@/lib/discovery/manual-import/service'
import { unavailableAi } from '@/lib/discovery/manual-import/no-ai'
import {
  importCandidateSchema,
  MAX_IMPORT_ITEMS,
  MAX_PASTE_CHARS,
  type ExtractResult,
  type ImportSummary,
} from '@/lib/discovery/manual-import/types'
import { logger } from '@/lib/logger'

/**
 * "Add from text or link" on Discovery: read openings out of pasted text
 * (review step), then import the ones the user ticked. lee fetches none of
 * the pasted pages; only known ATS links are read through their public
 * job-board APIs during the import.
 */

export type ExtractActionResult = { ok: true; result: ExtractResult } | { error: string }
export type ImportActionResult = { ok: true; summary: ImportSummary } | { error: string }

async function providerOrNull(userId: string): Promise<AIProvider | null> {
  try {
    return await getAIProviderForUser(userId)
  } catch {
    // No key saved: links-only extraction, scoring later.
    return null
  }
}

const textSchema = z.string().max(MAX_PASTE_CHARS * 2)

export async function extractPastedOpenings(text: unknown): Promise<ExtractActionResult> {
  const parsed = textSchema.safeParse(text)
  if (!parsed.success || parsed.data.trim().length === 0) return { error: 'Paste some text or links first.' }
  try {
    const userId = await requireUserId()
    const ai = await providerOrNull(userId)
    const result = await extractOpenings(parsed.data, ai, { userId })
    return { ok: true, result }
  } catch (err) {
    logger.error('extractPastedOpenings failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not read that text. Try again.' }
  }
}

const importSchema = z.array(importCandidateSchema).min(1).max(MAX_IMPORT_ITEMS)

export async function importPastedOpenings(items: unknown): Promise<ImportActionResult> {
  const parsed = importSchema.safeParse(items)
  if (!parsed.success) return { error: 'Pick at least one opening with a title and a link.' }
  try {
    const userId = await requireUserId()
    const ai = (await providerOrNull(userId)) ?? unavailableAi('No AI key: scoring runs on the next discovery run.')
    const summary = await importOpenings({ userId, candidates: parsed.data, ai })
    revalidatePath('/discoveries')
    revalidatePath('/shortlist')
    return { ok: true, summary }
  } catch (err) {
    logger.error('importPastedOpenings failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not import those openings. Try again.' }
  }
}
