import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { errorText } from '@/lib/reputation/http'
import type { RadarFetchDeps } from '../sources/types'
import { fetchLaunchesNew } from './feeds'
import { fetchGithubNew } from './github'
import { fetchHfNew } from './hf'
import { fetchHnNew } from './hn'
import { fetchPapersNew } from './papers'
import { loadPersonalContext } from './personal'
import { unionProjects } from './projects'
import { fetchReleases } from './releases'
import { storeNewItems } from './store'
import type { WhatsNewRunSummary } from './summary'
import type { NewFetchResult, NewSource } from './types'

/**
 * One shared "what's new" source run (the global `radar-new:source` job,
 * once a day): fetch once for every account, store once. Tokens are the
 * deployment's own optional env keys (GITHUB_TOKEN, HF_TOKEN) — never a
 * user's saved key, so one user's secret never serves another. A failing
 * source is recorded in its summary and tried again the next day.
 */

export type NewFetcher = (deps: RadarFetchDeps & { projects?: readonly string[] }) => Promise<NewFetchResult>

export const NEW_FETCHERS: Readonly<Record<NewSource, NewFetcher>> = {
  hf: fetchHfNew,
  hf_papers: fetchPapersNew,
  github: fetchGithubNew,
  releases: fetchReleases,
  hn: fetchHnNew,
  feeds: fetchLaunchesNew,
}

export interface NewRunOptions extends RadarFetchDeps {
  fetchers?: Partial<Record<NewSource, NewFetcher>>
  /** Release projects to fetch (default: the union of every user's list). */
  projects?: readonly string[]
}

/** Every user's release list (derived or edited), most-followed first, capped. */
export async function releaseProjectsForAll(): Promise<string[]> {
  const all = await db.select({ id: users.id }).from(users)
  const lists: string[][] = []
  for (const u of all) {
    try {
      lists.push((await loadPersonalContext(u.id)).releaseProjects)
    } catch (e) {
      logger.warn('radar_new_profile_failed', { err: errorText(e) })
    }
  }
  return unionProjects(lists)
}

function summary(source: NewSource, status: WhatsNewRunSummary['status'], extra: Partial<WhatsNewRunSummary> = {}): WhatsNewRunSummary {
  return { kind: 'radar-new', source, status, fetched: 0, new: 0, joined: 0, variants: 0, ...extra }
}

export async function runWhatsNewSource(source: NewSource, opts: NewRunOptions = {}): Promise<WhatsNewRunSummary> {
  const now = opts.now ?? new Date()
  const fetcher = opts.fetchers?.[source] ?? NEW_FETCHERS[source]
  try {
    const projects = source === 'releases' ? (opts.projects ?? (await releaseProjectsForAll())) : undefined
    const fetched = await fetcher({
      githubToken: process.env.GITHUB_TOKEN ?? null,
      hfToken: process.env.HF_TOKEN ?? null,
      ...opts,
      now,
      ...(projects ? { projects } : {}),
    })
    const counts = await storeNewItems(source, fetched.items, now)
    const partial = fetched.partialErrors
    logger.info('radar_new_polled', { source, fetched: counts.fetched, new: counts.new, joined: counts.joined, variants: counts.variants, partialErrors: partial.length })
    return summary(source, 'polled', {
      fetched: counts.fetched,
      new: counts.new,
      joined: counts.joined,
      variants: counts.variants,
      ...(partial.length > 0 ? { partialErrors: partial.length, error: partial[0]?.slice(0, 160) } : {}),
    })
  } catch (e) {
    const err = errorText(e).slice(0, 160)
    logger.warn('radar_new_failed', { source, err })
    return summary(source, 'failed', { error: err })
  }
}
