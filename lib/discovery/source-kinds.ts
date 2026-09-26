/**
 * Discovery source kinds offered in Settings › Sources, and the one config
 * field each needs. Client-safe (no imports) — shared by the add/edit
 * dialogs and the server actions that validate them.
 */
export interface SourceKindMeta {
  id: string
  label: string
  description: string
  needs: 'company' | 'url' | 'none'
  placeholder?: string
}

export const SOURCE_KINDS: readonly SourceKindMeta[] = [
  { id: 'greenhouse', label: 'Greenhouse', description: 'Company board on greenhouse.io', needs: 'company', placeholder: 'stripe' },
  { id: 'lever', label: 'Lever', description: 'Company board on lever.co', needs: 'company', placeholder: 'netflix' },
  { id: 'ashby', label: 'Ashby', description: 'Company board on ashbyhq.com', needs: 'company', placeholder: 'ramp' },
  { id: 'workable', label: 'Workable', description: 'Company board on workable.com', needs: 'company', placeholder: 'company-slug' },
  { id: 'remoteok', label: 'RemoteOK', description: 'All remote-friendly jobs on remoteok.com', needs: 'none' },
  { id: 'hn_whoishiring', label: "HN Who's Hiring", description: 'Monthly HN "Who is hiring?" thread', needs: 'none' },
  { id: 'yc_directory', label: 'YC Directory', description: 'Y Combinator company directory', needs: 'none' },
  { id: 'rss', label: 'RSS feed', description: 'Any jobs RSS feed URL', needs: 'url', placeholder: 'https://example.com/jobs.rss' },
  { id: 'jsonld', label: 'JSON-LD JobPosting', description: 'A page with JSON-LD JobPosting markup', needs: 'url', placeholder: 'https://example.com/careers' },
]

const BY_ID = new Map(SOURCE_KINDS.map((k) => [k.id, k] as const))

export function getSourceKind(id: string): SourceKindMeta | undefined {
  return BY_ID.get(id)
}

/** Which config field a kind needs; unknown kinds (legacy rows) need none. */
export function sourceKindNeeds(kind: string): SourceKindMeta['needs'] {
  return BY_ID.get(kind)?.needs ?? 'none'
}

/** Board slugs as the ATS hosts accept them in their public API paths. */
export const BOARD_SLUG_RE = /^[A-Za-z0-9._-]{1,200}$/
