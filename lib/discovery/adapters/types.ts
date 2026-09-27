// Discovery adapter contract. Every adapter fetches from ONE source kind and
// returns normalized items ready to persist. Adapter authors keep network I/O
// self-contained here — the service layer only iterates results, upserts, and
// scores.

export interface DiscoveryItem {
  /** Stable id from the source (used with sourceId for dedup). */
  sourceItemId: string
  /** Full source payload; stored verbatim for later re-processing. */
  raw: unknown
  normalized: NormalizedJob | NormalizedCompany
}

export interface NormalizedJob {
  kind: 'job'
  title: string
  companyName: string
  companyDomain?: string
  companyWebsite?: string
  location?: string
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
  employmentType?: 'fulltime' | 'contract' | 'parttime' | 'internship' | 'unknown'
  descriptionMd: string
  applyUrl: string
  postedAt?: Date
  techStack: string[]
  salary?: { min?: number; max?: number; currency?: string }
  /**
   * The site a posting came from when one source aggregates several
   * (email_alert: linkedin, indeed, naukri …).
   */
  subSource?: string
  /**
   * Machine-readable hints for downstream filters, never shown as-is, e.g.
   * `board:remoteok`, `geo:worldwide` / `geo:restricted`,
   * `via:email_alert`. Adapters only tag; they don't filter.
   */
  tags?: string[]
  raw: unknown
}

export interface NormalizedCompany {
  kind: 'company'
  name: string
  domain?: string
  website?: string
  description?: string
  industry?: string[]
  size?: string
  stage?: string
  hqCountry?: string
  hqCity?: string
  officeLocations?: string[]
  techStack?: string[]
  fundingUsd?: number
  raw: unknown
}

/** Who the poll is for: adapters that need a per-user key, the profile's
 * search preferences or the user's Gmail read it from here. */
export interface AdapterContext {
  userId: string
}

export interface DiscoveryAdapter {
  /** Matches sources.kind — used as the registry key. */
  kind: string
  fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]>
}
