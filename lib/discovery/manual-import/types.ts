import { z } from 'zod'

/**
 * One opening found in pasted text, shown in the review list before the
 * user ticks what to import. Client-safe.
 */
export interface OpeningCandidate {
  /** Stable key within one extraction (the review list's row key). */
  key: string
  title: string
  employer: string
  location: string
  /** As the text states it; parsed only on import. */
  postedDate: string
  /** Canonical link from the pasted text; '' when the text had none (cannot be imported). */
  url: string
  snippet: string
  /** Job board lee only links to (LinkedIn, Indeed …); null otherwise. */
  board: string | null
  /** ATS whose public job-board API will fill in the details; null when link-only. */
  ats: string | null
  /** A watched GCC employer (lib/defaults/watch-employers.ts) this opening belongs to. */
  watch: { name: string; nationalsOnly: boolean } | null
}

export type ExtractMode = 'ai' | 'urls'

export interface ExtractResult {
  candidates: OpeningCandidate[]
  mode: ExtractMode
  /** Why the AI was not used or failed, shown under the list. */
  note: string | null
}

const field = (max: number) => z.string().trim().max(max).default('')

/** What the import action accepts back from the client (the user may edit titles). */
export const importCandidateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  employer: field(200),
  location: field(200),
  postedDate: field(40),
  url: z.string().trim().url().max(2000),
  snippet: field(500),
})
export type ImportCandidate = z.infer<typeof importCandidateSchema>

export const MAX_IMPORT_ITEMS = 30
export const MAX_PASTE_CHARS = 20_000

export interface ImportSummary {
  imported: number
  /** Already a discovery (same link, or same employer and title). */
  duplicates: number
  /** Filled in from the ATS's public job board. */
  enriched: number
  quarantined: number
}
