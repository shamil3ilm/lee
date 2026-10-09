import type { CompanyHttpDeps } from '../http'
import type { PageResult } from '../cursors'
import type { CompanyCandidate } from '../types'
import { fetchFlat6labsPage, fetchStartupBahrain } from './accelerators'
import { fetchQstp } from './directories'
import { fetchNasscomPage } from './nasscom'
import { fetchCyberpark, fetchInfoparkPage, fetchUlCyberpark } from './kerala-parks'
import { fetchTechnoparkPage } from './technopark'

/**
 * The directories lee reads automatically (robots.txt and terms checked;
 * docs/job-sources.md), each with the places that switch it on. Every one
 * lists companies regardless of fame (hundreds of small firms per park), so
 * the WHOLE list is read: paged lists walk their pages with a cursor until
 * done, resuming next run when time runs out.
 */

export interface AutoDirectory {
  id: string
  label: string
  /** Region-taxonomy places (from the user's target places) that switch it on. */
  places: readonly string[]
  fetchPage: (page: number, deps: CompanyHttpDeps) => Promise<PageResult<CompanyCandidate>>
  /** Cursor steps per run (default DIRECTORY_PAGES_PER_RUN). */
  maxPages?: number
  /** A national list: keep only companies inside the user's target regions. */
  targetsOnly?: boolean
}

function single(read: (deps: CompanyHttpDeps) => Promise<{ companies: CompanyCandidate[] } | CompanyCandidate[]>) {
  return async (_page: number, deps: CompanyHttpDeps): Promise<PageResult<CompanyCandidate>> => {
    const r = await read(deps)
    return { items: Array.isArray(r) ? r : r.companies, lastPage: 1 }
  }
}

export const AUTO_DIRECTORIES: readonly AutoDirectory[] = [
  {
    id: 'technopark',
    label: 'Technopark',
    places: ['thiruvananthapuram', 'kerala'],
    fetchPage: async (page, deps) => {
      const r = await fetchTechnoparkPage(page, deps)
      return { items: r.companies, lastPage: r.lastPage }
    },
  },
  {
    id: 'infopark',
    label: 'Infopark',
    places: ['kochi', 'kerala'],
    fetchPage: async (page, deps) => {
      const r = await fetchInfoparkPage(page, deps)
      return { items: r.companies, lastPage: r.lastPage }
    },
  },
  { id: 'cyberpark', label: 'Kerala Cyberpark', places: ['kozhikode', 'kerala'], fetchPage: single(fetchCyberpark) },
  { id: 'ul-cyberpark', label: 'UL Cyberpark', places: ['kozhikode', 'kerala'], fetchPage: single(fetchUlCyberpark) },
  { id: 'qstp', label: 'QSTP', places: ['doha', 'qa'], fetchPage: single(fetchQstp) },
  { id: 'startup-bahrain', label: 'StartUp Bahrain', places: ['bh', 'manama'], fetchPage: single(fetchStartupBahrain) },
  // 23 steps of 20 company pages; 3 a run, so the portfolio comes round in about 8 weeks.
  { id: 'flat6labs', label: 'Flat6Labs', places: ['sa', 'ae', 'bh', 'om', 'qa', 'kw', 'riyadh', 'jeddah', 'dubai', 'abu-dhabi', 'manama', 'doha'], fetchPage: fetchFlat6labsPage, maxPages: 3, targetsOnly: true },
  // About 243 pages of 15 members; 10 a run, about 24 weeks for a full pass. Members outside the target places are dropped.
  {
    id: 'nasscom',
    label: 'NASSCOM members',
    places: ['in', 'kerala', 'kochi', 'thiruvananthapuram', 'kozhikode', 'bengaluru', 'hyderabad', 'chennai', 'pune'],
    fetchPage: fetchNasscomPage,
    maxPages: 10,
    targetsOnly: true,
  },
]

/** Pages one directory may read in a run (Technopark has 25, Infopark 10). */
export const DIRECTORY_PAGES_PER_RUN = 30

/** The directories the target places switch on. */
export function directoriesFor(placeIds: ReadonlySet<string>): AutoDirectory[] {
  return AUTO_DIRECTORIES.filter((d) => d.places.some((p) => placeIds.has(p)))
}
