import type { FitChip } from '@/lib/company-discovery/fit'
import type { Confidence, GrowthSignal } from '@/lib/company-discovery/growth/types'

/** The growth chip and its "Why" popover. */
export interface CompanyGrowthCard {
  score: number | null
  confidence: Confidence | null
  signals: GrowthSignal[]
}

/** One company card in Discovery › Companies (serialisable; built on the server). */
export interface CompanyCardData {
  id: string
  name: string
  website: string | null
  domain: string | null
  logoUrl: string | null
  regionLabel: string | null
  /** "Kochi › Kerala › India". */
  locationChain: string | null
  industries: string[]
  sizeBand: string | null
  stage: string | null
  description: string | null
  fitScore: number | null
  chips: FitChip[]
  /** "Greenhouse", "Workday"… when a job board was found. */
  boardLabel: string | null
  /** "Watch jobs" can add a source for the board. */
  watchable: boolean
  careersUrl: string | null
  openRoles: number | null
  connections: number
  emails: string[]
  status: string
  watch: string | null
  sourceTags: string[]
  listedAt: string | null
  enrichStatus: string | null
  careersNote: string | null
  dismissReason: string | null
  tracked: boolean
  githubLogin: string | null
  growth: CompanyGrowthCard
  /** "Under the radar": good fit, growing or hiring, little public visibility. */
  hiddenGem: boolean
  radarReasons: string[]
  /** Listed only by a map or a register (OpenStreetMap, GLEIF, India MCA): why it appeared. */
  foundVia: 'map' | 'register' | 'map and register' | null
  /** Does it employ software / data / analyst people? ("Likely hires: data/IT (bank, 1,000+ staff)"). */
  hires: { band: 'high' | 'medium' | 'low'; why: string }
  /** A plain Google Maps search link (no API, nothing stored). */
  mapsUrl: string
}

export const SOURCE_TAG_LABELS: Readonly<Record<string, string>> = {
  wikidata: 'Wikidata',
  github: 'GitHub',
  yc: 'Y Combinator',
  linkedin: 'Your connections',
  paste: 'Added by you',
  jobs: 'Seen hiring in your jobs',
  seed: 'Well-known employers list',
  search: 'Added by you (search)',
  'directory:technopark': 'Technopark',
  'directory:infopark': 'Infopark',
  'directory:cyberpark': 'Kerala Cyberpark',
  'directory:ul-cyberpark': 'UL Cyberpark',
  'directory:qstp': 'QSTP',
  'directory:flat6labs': 'Flat6Labs',
  'directory:startup-bahrain': 'StartUp Bahrain',
  'directory:nasscom': 'NASSCOM',
  'map:osm': 'OpenStreetMap',
  'register:gleif': 'GLEIF (LEI register)',
  'register:mca': 'MCA company register (India)',
}

export function sourceTagLabel(tag: string): string {
  return SOURCE_TAG_LABELS[tag] ?? tag.replace(/^(directory|map|register):/, '')
}

/** "Found via map/register" when only maps or registers listed the company (other sources explain themselves). */
export function foundViaOf(tags: readonly string[]): CompanyCardData['foundVia'] {
  const map = tags.some((t) => t.startsWith('map:'))
  const register = tags.some((t) => t.startsWith('register:'))
  const other = tags.some((t) => !t.startsWith('map:') && !t.startsWith('register:'))
  if (other || (!map && !register)) return null
  return map && register ? 'map and register' : map ? 'map' : 'register'
}
