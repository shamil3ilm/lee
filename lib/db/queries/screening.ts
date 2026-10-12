import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'

/**
 * Reads for the screening path (lib/screening), computed on read and never
 * stored. Only what a path needs: the JD (cut to 8 000 chars in SQL, a
 * pasted JD first), the stored Match detail and best CV, and a few posting
 * facts. Read-only; `raw` is never selected.
 */

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

export interface ScreeningRow {
  id: string
  title: string | null
  companyName: string | null
  location: string | null
  remoteType: string | null
  employmentType: string | null
  descriptionMd: string | null
  techStack: unknown
  salary: unknown
  applyUrl: string | null
  postedAt: string | null
  fitDetail: unknown
  bestCv: unknown
  createdAt: Date
}

const COLUMNS = {
  id: discoveries.id,
  title: n('title'),
  companyName: n('companyName'),
  location: n('location'),
  remoteType: n('remoteType'),
  employmentType: n('employmentType'),
  descriptionMd: sql<string | null>`left(coalesce(${discoveries.pastedJd}, ${discoveries.normalized}->>'descriptionMd'), 8000)`,
  techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
  salary: sql<unknown>`${discoveries.normalized}->'salary'`,
  applyUrl: n('applyUrl'),
  postedAt: n('postedAt'),
  fitDetail: discoveries.fitDetail,
  bestCv: discoveries.bestCv,
  createdAt: discoveries.createdAt,
}

/** The user's rows among `ids` (others are ignored). */
export async function rowsForScreening(userId: string, ids: readonly string[], client: DbClient = db): Promise<ScreeningRow[]> {
  if (ids.length === 0) return []
  return client
    .select(COLUMNS)
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.id, [...ids])))
}
