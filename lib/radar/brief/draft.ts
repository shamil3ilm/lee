import type { AIProvider } from '@/lib/ai/types'
import { AISkippedError } from '@/lib/ai/signal'
import { writeSkipLog } from '@/lib/ai/log'
import { e2eAiFixturesEnabled } from '@/lib/ai'
import { RADAR_BRIEF_PROMPT_VERSION, RADAR_BRIEF_SYSTEM, type RadarBriefInput } from '@/lib/ai/prompts/radar-brief'
import { hashPrompt } from '@/lib/ai/prompts/hash'
import * as feedQ from '@/lib/db/queries/radarFeed'
import * as itemsQ from '@/lib/db/queries/radarItems'
import { logger } from '@/lib/logger'
import { errorText } from '@/lib/reputation/http'
import type { RadarMetrics } from '../types'
import { RadarError } from '../errors'
import { filterCitations } from './citations'
import { fetchSourceText, type SourceFetchDeps } from './fetch-source'
import { MIN_PRIMARY_SOURCES, primaryCandidates, type PrimaryCandidate } from './primary'
import { signDraft } from './sign'
import { computeTimeline } from './timeline'
import type { BriefDraft, BriefSource } from './types'

/**
 * Draft a grounded brief, on demand. Signal gate: at least two primary
 * sources (official post, README, model card, paper abstract — from the
 * entry's own items) must be FETCHED, else the call is skipped and logged
 * (AISkippedError, no model call). The model's sentences then pass the
 * verbatim citation check; the timeline comes from metadata. Nothing is
 * saved here — the user confirms first (./confirm.ts).
 */

export const MIN_SOURCE_TEXT = 200
export const SKIP_CODE = 'radar_brief_sources'

export interface DraftDeps extends SourceFetchDeps {
  now?: Date
  /** Offline mode: use each item's own title and excerpt as the source text. */
  offlineSources?: boolean
}

function skip(message: string): AISkippedError {
  return new AISkippedError(SKIP_CODE, message, 'Wait for more sources (an official post, a README, a model card or a paper) to reach this entry.')
}

async function fetchAll(candidates: readonly PrimaryCandidate[], deps: DraftDeps, now: Date) {
  const ok: Array<{ source: BriefSource; text: string }> = []
  const failed: string[] = []
  for (const c of candidates) {
    try {
      const text = deps.offlineSources ? c.fallbackText : await fetchSourceText(c.fetchUrl, deps)
      if (text.length < (deps.offlineSources ? 20 : MIN_SOURCE_TEXT)) throw new Error('too little text')
      const source: BriefSource = { id: `S${ok.length + 1}`, kind: c.kind, url: c.url, title: c.title, fetchedAt: now.toISOString() }
      ok.push({ source, text })
    } catch (e) {
      failed.push(errorText(e))
    }
  }
  return { ok, failed }
}

function offlineDefault(deps: DraftDeps): boolean {
  if (deps.offlineSources !== undefined) return deps.offlineSources
  return process.env.NODE_ENV !== 'production' && e2eAiFixturesEnabled(process.env)
}

export async function draftBrief(userId: string, entryId: string, ai: AIProvider, deps: DraftDeps = {}): Promise<BriefDraft> {
  const now = deps.now ?? new Date()
  const entry = await itemsQ.getEntry(userId, entryId)
  if (!entry) throw new RadarError('That entry is gone.', 'not_found')
  const items = await itemsQ.itemsOfEntry(userId, entryId)
  const candidates = primaryCandidates(items.map((i) => ({ ...i, metrics: i.metrics as RadarMetrics })))
  const notEnough = async (have: number): Promise<never> => {
    await writeSkipLog({ userId, provider: 'signal', kind: 'radar_brief' }, SKIP_CODE)
    logger.info('radar_brief_skipped', { sources: have })
    throw skip(`Not enough sources for a brief: ${have} of ${MIN_PRIMARY_SOURCES} primary sources.`)
  }
  if (candidates.length < MIN_PRIMARY_SOURCES) return notEnough(candidates.length)
  const { ok, failed } = await fetchAll(candidates, { ...deps, offlineSources: offlineDefault(deps) }, now)
  if (ok.length < MIN_PRIMARY_SOURCES) {
    if (failed.length > 0) logger.warn('radar_brief_source_failed', { failed: failed.length, err: failed[0] })
    return notEnough(ok.length)
  }
  const related = (await feedQ.listEntries(userId, { kind: entry.kind }, { limit: 12 }))
    .filter((e) => e.id !== entryId)
    .map((e) => e.name)
    .slice(0, 8)
  const input: RadarBriefInput = {
    name: entry.name,
    kind: entry.kind,
    sources: ok.map(({ source, text }) => ({ id: source.id, kind: source.kind, title: source.title, url: source.url, text })),
    related,
  }
  const raw = await ai.writeRadarBrief(input, { userId, kind: 'radar_brief' })
  const texts = new Map(ok.map(({ source, text }) => [source.id, text]))
  const { sections, kept, dropped } = filterCitations(raw, texts)
  const timeline = computeTimeline(items.map((i) => ({ ...i, metrics: i.metrics as RadarMetrics })))
  logger.info('radar_brief_drafted', { sources: ok.length, kept, dropped })
  return signDraft({
    entryId,
    sections,
    sources: ok.map((o) => o.source),
    timeline,
    promptVersion: RADAR_BRIEF_PROMPT_VERSION,
    // The template's hash: drift shows when the prompt changes without a version bump.
    promptHash: hashPrompt(RADAR_BRIEF_SYSTEM),
    dropped,
  })
}
