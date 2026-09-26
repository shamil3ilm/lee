import { and, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { documents } from '@/lib/db/schema'

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
export type DocumentKind =
  | 'master_cv'
  | 'tailored_cv'
  | 'cover_letter'
  | 'outreach_linkedin_connection'
  | 'outreach_linkedin_message'
  | 'outreach_recruiter_reply'
  | 'outreach_followup_email'
  | 'interview_prep_pack'
  | 'interview_debrief'
  | 'latex_cv'
  | 'latex_cover_letter'
  // v7 — merged PDFs are stored as document rows with `content` describing
  // the sources; the actual PDF bytes are re-generated on download (no
  // caching layer). See lib/documents/merge.ts.
  | 'merged_pdf'

export interface ListOptions {
  applicationId?: string
  kind?: DocumentKind
}

export async function create(
  userId: string,
  data: Omit<NewDocument, 'userId' | 'id' | 'createdAt' | 'updatedAt'>,
  client: DbClient = db,
): Promise<Document> {
  const [row] = await client
    .insert(documents)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert document')
  return row
}

/** A document row without its `content` payload — what list views render. */
export type DocumentSummary = Omit<Document, 'content'>

// Every column except `content` (the CV / letter / LaTeX source JSON, often
// tens of KB per row).
const { content: _content, ...SUMMARY_COLUMNS } = getTableColumns(documents)
void _content

function listFilters(userId: string, opts: ListOptions) {
  const filters = [eq(documents.userId, userId)]
  if (opts.applicationId !== undefined) {
    filters.push(eq(documents.applicationId, opts.applicationId))
  }
  if (opts.kind) filters.push(eq(documents.kind, opts.kind))
  return and(...filters)
}

/** List documents newest first — metadata only (no `content`). */
export async function list(
  userId: string,
  opts: ListOptions = {},
  client: DbClient = db,
): Promise<DocumentSummary[]> {
  return client
    .select(SUMMARY_COLUMNS)
    .from(documents)
    .where(listFilters(userId, opts))
    .orderBy(desc(documents.createdAt))
}

/**
 * Like `list` but including `content`. Only for callers that render or
 * parse the payload of every row (e.g. outreach drafts on the application
 * page) — keep the filter narrow.
 */
export async function listWithContent(
  userId: string,
  opts: ListOptions = {},
  client: DbClient = db,
): Promise<Document[]> {
  return client
    .select()
    .from(documents)
    .where(listFilters(userId, opts))
    .orderBy(desc(documents.createdAt))
}

/**
 * The user's current master CV: highest version among `master_cv` rows with
 * no application. One row, with content.
 */
export async function getLatestMaster(
  userId: string,
  client: DbClient = db,
): Promise<Document | null> {
  const [row] = await client
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, userId),
        eq(documents.kind, 'master_cv'),
        isNull(documents.applicationId),
      ),
    )
    .orderBy(desc(documents.version), desc(documents.createdAt))
    .limit(1)
  return row ?? null
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Document | null> {
  const [row] = await client
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, id)))
    .limit(1)
  return row ?? null
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<Omit<NewDocument, 'id' | 'userId' | 'createdAt'>>,
  client: DbClient = db,
): Promise<Document | null> {
  const [row] = await client
    .update(documents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(documents.userId, userId), eq(documents.id, id)))
    .returning()
  return row ?? null
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<void> {
  await client.delete(documents).where(and(eq(documents.userId, userId), eq(documents.id, id)))
}

/**
 * Returns the next version number for (userId, applicationId, kind). For the
 * master CV, `applicationId` should be null. Uses max(version)+1 so concurrent
 * writes are only best-effort ordered — good enough for a single-user tracker.
 */
export async function nextVersion(
  userId: string,
  applicationId: string | null,
  kind: DocumentKind,
  client: DbClient = db,
): Promise<number> {
  const appFilter = applicationId === null
    ? isNull(documents.applicationId)
    : eq(documents.applicationId, applicationId)
  const [row] = await client
    .select({ max: sql<number | null>`max(${documents.version})` })
    .from(documents)
    .where(and(eq(documents.userId, userId), appFilter, eq(documents.kind, kind)))
  const max = row?.max ?? 0
  return max + 1
}
