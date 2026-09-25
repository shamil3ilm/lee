import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  applications,
  companies,
  contacts,
  discoveries,
  jobs,
} from '@/lib/db/schema'

/** Result kinds — mirrors the four resource surfaces in the app. */
export type SearchKind = 'application' | 'company' | 'contact' | 'discovery'

export interface SearchHit {
  kind: SearchKind
  id: string
  /** Short label shown as the first line of the row. */
  title: string
  /** Optional right-side subtitle (e.g. company name, email, source). */
  subtitle: string | null
  /** Where clicking the row should navigate. */
  href: string
}

export interface SearchResults {
  applications: SearchHit[]
  companies: SearchHit[]
  contacts: SearchHit[]
  discoveries: SearchHit[]
}

const EMPTY: SearchResults = {
  applications: [],
  companies: [],
  contacts: [],
  discoveries: [],
}

const PER_KIND_LIMIT = 5

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/**
 * Fuzzy `ilike '%q%'` search scoped to the calling user. Returns at most 5
 * hits per resource kind. Empty / very short queries return an empty result
 * so we never over-fetch on the first keystroke.
 */
export async function search(userId: string, query: string): Promise<SearchResults> {
  const q = query.trim()
  if (q.length < 2) return EMPTY

  const like = `%${escapeLike(q)}%`

  // --- applications: match on job title, filter to this user, join company
  const appRows = await db
    .select({
      id: applications.id,
      status: applications.status,
      jobTitle: jobs.title,
      companyName: companies.name,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        eq(applications.userId, userId),
        or(ilike(jobs.title, like), ilike(companies.name, like)),
      ),
    )
    .orderBy(sql`${applications.updatedAt} desc`)
    .limit(PER_KIND_LIMIT)

  const applicationsHits: SearchHit[] = appRows.map((r) => ({
    kind: 'application',
    id: r.id,
    title: r.jobTitle,
    subtitle: r.companyName ? `${r.companyName} · ${r.status}` : r.status,
    href: `/applications/${r.id}`,
  }))

  // --- companies
  const companyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
    })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        or(ilike(companies.name, like), ilike(companies.domain, like)),
      ),
    )
    .orderBy(companies.name)
    .limit(PER_KIND_LIMIT)

  const companiesHits: SearchHit[] = companyRows.map((r) => ({
    kind: 'company',
    id: r.id,
    title: r.name,
    subtitle: r.domain,
    href: `/companies/${r.id}`,
  }))

  // --- contacts
  const contactRows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      role: contacts.role,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(
          ilike(contacts.name, like),
          ilike(contacts.email, like),
          ilike(contacts.role, like),
        ),
      ),
    )
    .orderBy(contacts.name)
    .limit(PER_KIND_LIMIT)

  const contactsHits: SearchHit[] = contactRows.map((r) => ({
    kind: 'contact',
    id: r.id,
    title: r.name,
    subtitle: r.email ?? r.role,
    href: `/contacts`,
  }))

  // --- discoveries: match on normalized.title (jsonb text search)
  // Using ->> keeps us on a plain LIKE index-friendly cast; the row count
  // for a single user's discovery inbox stays small enough that a full scan
  // per keystroke is fine.
  const discoveryRows = await db
    .select({
      id: discoveries.id,
      matchScore: discoveries.matchScore,
      normalized: discoveries.normalized,
      status: discoveries.status,
    })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.userId, userId),
        or(
          sql`${discoveries.normalized}->>'title' ILIKE ${like}`,
          sql`${discoveries.normalized}->>'companyName' ILIKE ${like}`,
        ),
      ),
    )
    .orderBy(sql`${discoveries.createdAt} desc`)
    .limit(PER_KIND_LIMIT)

  const discoveriesHits: SearchHit[] = discoveryRows.map((r) => {
    const n = (r.normalized ?? {}) as { title?: string; companyName?: string }
    return {
      kind: 'discovery',
      id: r.id,
      title: n.title ?? 'Untitled role',
      subtitle: [n.companyName, r.matchScore != null ? `match ${r.matchScore}` : null]
        .filter(Boolean)
        .join(' · ') || null,
      href: `/discoveries`,
    }
  })

  return {
    applications: applicationsHits,
    companies: companiesHits,
    contacts: contactsHits,
    discoveries: discoveriesHits,
  }
}
