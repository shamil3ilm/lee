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
}

export function sourceTagLabel(tag: string): string {
  return SOURCE_TAG_LABELS[tag] ?? tag.replace(/^directory:/, '')
}
