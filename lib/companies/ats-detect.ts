export type ATSKind = 'greenhouse' | 'lever' | 'ashby' | 'workable'
export type DetectedATS = { kind: ATSKind; slug: string } | null

interface Candidate {
  kind: ATSKind
  url: (slug: string) => string
}

const CANDIDATES: Candidate[] = [
  { kind: 'greenhouse', url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs` },
  { kind: 'lever', url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json` },
  { kind: 'ashby', url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}` },
  { kind: 'workable', url: (s) => `https://apply.workable.com/api/v3/accounts/${s}/jobs` },
]

export async function detectATSFromDomain(domain: string): Promise<DetectedATS> {
  const slug = slugFromDomain(domain)
  for (const c of CANDIDATES) {
    try {
      const res = await fetch(c.url(slug), { method: 'GET' })
      if (res.ok) return { kind: c.kind, slug }
    } catch {
      // Ignore network errors — treat as "not this ATS" and continue probing.
    }
  }
  return null
}

function slugFromDomain(domain: string): string {
  const host = domain.replace(/^www\./, '')
  const first = host.split('.')[0]
  return (first ?? host).toLowerCase()
}
