import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'
import type { ExistingPosting } from '@/lib/discovery/manual-import/dedupe'

/**
 * Existing job discoveries (any source) that may be the same posting as one
 * of the given links or titles: same link (a few spellings of it), or the
 * same title case-insensitively. Returns three small strings per row, never
 * the jsonb payload; the caller compares canonical forms.
 */
export async function findPossibleDuplicates(
  userId: string,
  input: { urls: readonly string[]; titles: readonly string[] },
  client: DbClient = db,
): Promise<ExistingPosting[]> {
  const urls = [...new Set(input.urls.flatMap(urlSpellings))]
  const titles = [...new Set(input.titles.map((t) => t.trim().toLowerCase()).filter(Boolean))]
  if (urls.length === 0 && titles.length === 0) return []
  const applyUrl = sql<string | null>`${discoveries.normalized}->>'applyUrl'`
  const title = sql<string | null>`${discoveries.normalized}->>'title'`
  const conditions = [
    ...(urls.length > 0 ? [inArray(applyUrl, urls)] : []),
    ...(titles.length > 0 ? [inArray(sql`lower(${title})`, titles)] : []),
  ]
  const rows = await client
    .select({
      applyUrl,
      title,
      companyName: sql<string | null>`${discoveries.normalized}->>'companyName'`,
    })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), or(...conditions)))
    .limit(500)
  return rows
}

/** The canonical link plus the www / trailing-slash spellings adapters store. */
function urlSpellings(canonical: string): string[] {
  try {
    const u = new URL(canonical)
    const bare = `${u.protocol}//${u.host}${u.pathname}${u.search}`
    const www = `${u.protocol}//www.${u.host}${u.pathname}${u.search}`
    const slash = (s: string) => (u.pathname.endsWith('/') || u.search ? s : `${s}/`)
    return [canonical, bare, www, slash(bare), slash(www)]
  } catch {
    return [canonical]
  }
}
