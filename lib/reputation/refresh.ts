import * as companiesQ from '@/lib/db/queries/companies'
import * as repQ from '@/lib/db/queries/companyReputation'
import { logger } from '@/lib/logger'
import { errorText } from './http'
import { mergeSignals } from './merge'
import { fetchGdeltNews } from './sources/gdelt'
import { fetchHackerNews } from './sources/hn'
import type { SourceDeps, SourceFetcher, SourceResult } from './sources/types'
import { fetchWikidataFacts } from './sources/wikidata'
import { AUTO_SOURCES, type AutoSource, type SourceStatus, type SourceStatusMap } from './types'

/**
 * Refresh one company's automatic signals. Sources run one after another
 * (each host is rate-limited anyway); a failing source records its error
 * and keeps its previously stored signals, so one outage never wipes data.
 */

export const FETCHERS: Readonly<Record<AutoSource, SourceFetcher>> = {
  hn: fetchHackerNews,
  gdelt: fetchGdeltNews,
  wikidata: fetchWikidataFacts,
}

export interface RefreshOptions extends SourceDeps {
  fetchers?: Partial<Record<AutoSource, SourceFetcher>>
}

export interface RefreshResult {
  status: 'refreshed' | 'not_found'
  signals: number
  /** "<source>: <message>" per failed source. */
  errors: string[]
}

type Outcome = { source: AutoSource; ok: true; result: SourceResult } | { source: AutoSource; ok: false; error: string }

async function runSources(
  company: { name: string; domain: string | null },
  opts: RefreshOptions,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  for (const source of AUTO_SOURCES) {
    const fetcher = opts.fetchers?.[source] ?? FETCHERS[source]
    try {
      outcomes.push({ source, ok: true, result: await fetcher(company, opts) })
    } catch (e) {
      outcomes.push({ source, ok: false, error: errorText(e) })
    }
  }
  return outcomes
}

function statusOf(o: Outcome, at: string): SourceStatus {
  return o.ok
    ? { ok: true, at, count: o.result.signals.length + (o.result.facts ? 1 : 0), error: null }
    : { ok: false, at, count: 0, error: o.error }
}

export async function refreshCompanyReputation(
  userId: string,
  companyId: string,
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const company = await companiesQ.getById(userId, companyId)
  if (!company) return { status: 'not_found', signals: 0, errors: [] }
  const now = opts.now ?? new Date()
  const existing = await repQ.get(userId, companyId)
  const outcomes = await runSources({ name: company.name, domain: company.domain }, { ...opts, now })
  const at = now.toISOString()
  const fresh = Object.fromEntries(outcomes.flatMap((o) => (o.ok ? [[o.source, o.result.signals]] : [])))
  const sourceStatus: SourceStatusMap = Object.fromEntries(outcomes.map((o) => [o.source, statusOf(o, at)]))
  const wiki = outcomes.find((o) => o.source === 'wikidata')
  const facts = wiki?.ok ? (wiki.result.facts ?? null) : (existing?.facts ?? null)
  const signals = mergeSignals(existing?.signals ?? [], fresh, now)
  await repQ.saveFetched(userId, companyId, { signals, sourceStatus, facts, fetchedAt: now })
  const failed = outcomes.flatMap((o) => (o.ok ? [] : [o]))
  for (const o of failed) logger.warn('reputation_source_failed', { source: o.source, err: o.error })
  logger.info('reputation_refreshed', { signals: signals.length, failedSources: failed.length })
  const errors = failed.map((o) => `${o.source}: ${o.error}`)
  return { status: 'refreshed', signals: signals.length, errors }
}
