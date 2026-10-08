import * as profileQ from '@/lib/db/queries/profile'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { logger } from '@/lib/logger'
import { errorText } from '@/lib/reputation/http'
import { resolveServiceSecret } from '@/lib/settings/secrets'
import { ingestItems } from './ingest'
import { RADAR_FETCHERS, type RadarFetchDeps, type RadarFetcher } from './sources'
import type { RadarRunStatus, RadarRunSummary } from './summary'
import { TERM_SOURCES, type RadarSource } from './types'

/**
 * One source run for one user (the `radar-source:user+source` job): fetch,
 * then ingest. A failing source never throws — the run records the error
 * in its summary (Radar › Sources shows staleness and the last error from
 * these summaries) and the next daily run tries again. 429s are not
 * retried within the day.
 */

export interface RunOptions extends RadarFetchDeps {
  fetchers?: Partial<Record<RadarSource, RadarFetcher>>
}

function summary(source: RadarSource, status: RadarRunStatus, extra: Partial<RadarRunSummary> = {}): RadarRunSummary {
  return { kind: 'radar-source', source, status, fetched: 0, new: 0, matched: 0, ...extra }
}

async function tokens(userId: string): Promise<{ githubToken: string | null; hfToken: string | null }> {
  const [gh, hf] = await Promise.all([
    resolveServiceSecret(userId, 'github_search').catch(() => ({ key: null })),
    resolveServiceSecret(userId, 'huggingface').catch(() => ({ key: null })),
  ])
  return { githubToken: gh.key, hfToken: hf.key }
}

export async function runRadarSource(userId: string, source: RadarSource, opts: RunOptions = {}): Promise<RadarRunSummary> {
  const profile = await profileQ.get(userId)
  if ((profile?.radarSourcesOff ?? []).includes(source)) return summary(source, 'off')
  const terms = (await termsQ.list(userId)).filter((t) => !t.muted)
  if (TERM_SOURCES.has(source) && terms.length === 0 && source !== 'github') return summary(source, 'skipped')
  const now = opts.now ?? new Date()
  const fetcher = opts.fetchers?.[source] ?? RADAR_FETCHERS[source]
  try {
    const deps: RadarFetchDeps = { ...opts, now, terms, ...(await tokens(userId)) }
    const fetched = await fetcher(deps)
    const counts = await ingestItems(userId, fetched.items, terms, now)
    const partial = fetched.partialErrors
    logger.info('radar_source_polled', { source, ...counts, partialErrors: partial.length })
    return summary(source, 'polled', {
      ...counts,
      ...(partial.length > 0 ? { partialErrors: partial.length, error: partial[0]?.slice(0, 160) } : {}),
    })
  } catch (e) {
    const err = errorText(e).slice(0, 160)
    logger.warn('radar_source_failed', { source, err })
    return summary(source, 'failed', { error: err })
  }
}
