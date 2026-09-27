import type { HttpDeps } from '../http'
import type { CompanyFacts, ReputationSignal } from '../types'

export interface CompanyRef {
  name: string
  domain: string | null
}

export interface SourceDeps extends HttpDeps {
  now?: Date
}

export interface SourceResult {
  signals: readonly ReputationSignal[]
  /** Wikidata only: `null` = searched, no confident match. */
  facts?: CompanyFacts | null
}

export type SourceFetcher = (company: CompanyRef, deps?: SourceDeps) => Promise<SourceResult>
