import type { RadarSource } from '../types'
import { fetchArxiv } from './arxiv'
import { fetchOfficialFeeds } from './feeds'
import { fetchGdeltTerms } from './gdelt'
import { fetchGithub } from './github'
import { fetchHfHub, fetchHfPapers } from './hf'
import { fetchHnTerms } from './hn'
import type { RadarFetcher } from './types'

export const RADAR_FETCHERS: Readonly<Record<RadarSource, RadarFetcher>> = {
  hf: fetchHfHub,
  hf_papers: fetchHfPapers,
  github: fetchGithub,
  arxiv: fetchArxiv,
  hn: fetchHnTerms,
  feeds: fetchOfficialFeeds,
  gdelt: fetchGdeltTerms,
}

export type { RadarFetchDeps, RadarFetchResult, RadarFetcher } from './types'
