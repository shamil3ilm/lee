import type { FitChip } from '@/lib/company-discovery/fit'

/** One company card in Discovery › Companies (serialisable; built on the server). */
export interface CompanyCardData {
  id: string
  name: string
  website: string | null
  domain: string | null
  logoUrl: string | null
  regionLabel: string | null
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
}

export const SOURCE_TAG_LABELS: Readonly<Record<string, string>> = {
  wikidata: 'Wikidata',
  github: 'GitHub',
  yc: 'Y Combinator',
  linkedin: 'Your connections',
  paste: 'Added by you',
  'directory:technopark': 'Technopark',
  'directory:qstp': 'QSTP',
}

export function sourceTagLabel(tag: string): string {
  return SOURCE_TAG_LABELS[tag] ?? tag.replace(/^directory:/, '')
}
