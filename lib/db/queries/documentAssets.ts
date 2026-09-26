import { createHash } from 'node:crypto'
import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db, type DbClient } from '@/lib/db/client'
import { documentAssets } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'

// Db / Tx are unions over the postgres-js and PGlite drivers, which hides
// the partial `.returning(fields)` overload from TypeScript. Both drivers
// support it at runtime; narrowing lets writes return metadata (not bytes).
function narrow(client: DbClient): PostgresJsDatabase<typeof schema> {
  return client as unknown as PostgresJsDatabase<typeof schema>
}

// The columns to return from `list` — bytes are intentionally excluded so
// the client (and the network hop) never carry the payload when the caller
// only needs metadata for a list view.
const METADATA_COLUMNS = {
  id: documentAssets.id,
  userId: documentAssets.userId,
  documentId: documentAssets.documentId,
  filename: documentAssets.filename,
  mimeType: documentAssets.mimeType,
  sizeBytes: documentAssets.sizeBytes,
  driveFileId: documentAssets.driveFileId,
  drivePicked: documentAssets.drivePicked,
  createdAt: documentAssets.createdAt,
}

export type AssetMetadata = {
  id: string
  userId: string
  documentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  /** Google Drive file id when the bytes live in Drive (A2); else null. */
  driveFileId: string | null
  /** Attached from the Drive Picker: the user's own file, never trashed. */
  drivePicked: boolean
  createdAt: Date
}

/** A row with its payload column; `bytes` is null for Drive-backed assets. */
export type AssetWithBytes = AssetMetadata & { bytes: Buffer | null }

type AssetRow = typeof documentAssets.$inferSelect

function stripBytes(row: AssetRow): AssetMetadata {
  const { bytes: _bytes, sha256: _sha, ...rest } = row
  void _bytes
  void _sha
  return rest
}

function withBytes(row: AssetRow): AssetWithBytes {
  return { ...stripBytes(row), bytes: row.bytes }
}

export interface CreateAssetInput {
  filename: string
  mimeType: string
  sizeBytes: number
  bytes: Buffer
}

/** Hex sha256 of an asset payload (stored in document_assets.sha256). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export const MAX_ASSET_BYTES = 5 * 1024 * 1024
export const MAX_ASSETS_PER_DOCUMENT = 20

export class AssetValidationError extends Error {
  readonly code:
    | 'filename_empty'
    | 'file_too_large'
    | 'too_many_assets'
    | 'filename_conflict'
    | 'invalid_new_filename'
    | 'quota_exceeded'
  constructor(
    code:
      | 'filename_empty'
      | 'file_too_large'
      | 'too_many_assets'
      | 'filename_conflict'
      | 'invalid_new_filename'
      | 'quota_exceeded',
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'AssetValidationError'
  }
}

/**
 * Normalise a caller-supplied filename to something safe to embed in a LaTeX
 * source and to store on the compile server's filesystem. Strips directory
 * traversal, path separators, and any control characters; collapses runs of
 * whitespace to a single underscore. Preserves the extension.
 */
export function sanitizeFilename(input: string): string {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return ''
  // Drop any directory prefix (Windows or POSIX) and traversal segments.
  const noPath = trimmed.split(/[\\/]/).pop() ?? ''
  const noTraversal = noPath.replace(/\.\.+/g, '.')
  // Replace whitespace runs with a single '_'.
  const collapsed = noTraversal.replace(/\s+/g, '_')
  // Keep alphanumerics, dot, dash, underscore. Anything else → underscore.
  const safe = collapsed.replace(/[^A-Za-z0-9._-]/g, '_')
  // Collapse runs of underscores to a single one to keep names tidy.
  return safe.replace(/_{2,}/g, '_').slice(0, 200)
}

/**
 * List all assets belonging to (userId, documentId) — metadata only. Bytes
 * are intentionally excluded; use `get` / `getById` / `listWithBytes` when
 * you need the payload.
 */
export async function list(
  userId: string,
  documentId: string,
  client: DbClient = db,
): Promise<AssetMetadata[]> {
  const rows = await client
    .select(METADATA_COLUMNS)
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
    .orderBy(documentAssets.createdAt)
  // Cast: METADATA_COLUMNS mirrors AssetMetadata exactly (bytes excluded).
  return rows as AssetMetadata[]
}

/**
 * Get a single asset (with bytes) by (userId, documentId, filename). Returns
 * null when the asset doesn't exist or belongs to a different user.
 */
export async function get(
  userId: string,
  documentId: string,
  filename: string,
  client: DbClient = db,
): Promise<AssetWithBytes | null> {
  const [row] = await client
    .select()
    .from(documentAssets)
    .where(
      and(
        eq(documentAssets.userId, userId),
        eq(documentAssets.documentId, documentId),
        eq(documentAssets.filename, filename),
      ),
    )
    .limit(1)
  return row ? withBytes(row) : null
}

/**
 * Metadata (no bytes) for one asset by (userId, documentId, filename). Routes
 * use this plus the asset store, so they never touch the payload column.
 */
export async function getMeta(
  userId: string,
  documentId: string,
  filename: string,
  client: DbClient = db,
): Promise<AssetMetadata | null> {
  const [row] = await client
    .select(METADATA_COLUMNS)
    .from(documentAssets)
    .where(
      and(
        eq(documentAssets.userId, userId),
        eq(documentAssets.documentId, documentId),
        eq(documentAssets.filename, filename),
      ),
    )
    .limit(1)
  return (row as AssetMetadata | undefined) ?? null
}

/** Metadata (no bytes) for one asset by id, scoped to the user. */
export async function getMetaById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<AssetMetadata | null> {
  const [row] = await client
    .select(METADATA_COLUMNS)
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.id, id)))
    .limit(1)
  return (row as AssetMetadata | undefined) ?? null
}

/**
 * Get an asset by its primary-key id. Scoped by userId so cross-tenant
 * reads via a guessed uuid are impossible.
 */
export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<AssetWithBytes | null> {
  const [row] = await client
    .select()
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.id, id)))
    .limit(1)
  return row ? withBytes(row) : null
}

/**
 * Return every asset for a document with its bytes. Used by the compile
 * pipeline to bundle attachments alongside main.tex. Single query rather
 * than list + N `get` calls.
 */
export async function listWithBytes(
  userId: string,
  documentId: string,
  client: DbClient = db,
): Promise<AssetWithBytes[]> {
  const rows = await client
    .select()
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
    .orderBy(documentAssets.createdAt)
  return rows.map(withBytes)
}

/**
 * Create a new asset. Enforces:
 *   - filename is non-empty after sanitisation
 *   - size <= MAX_ASSET_BYTES (5MB per file)
 *   - document holds <= MAX_ASSETS_PER_DOCUMENT (20 per document)
 *   - filename is unique per document (also enforced at DB level via
 *     the unique index — we check up-front for a friendlier error).
 * Throws `AssetValidationError` on failure so the API layer can map to a
 * 4xx status without leaking driver-level errors.
 */
export async function validateNew(
  userId: string,
  documentId: string,
  input: { filename: string; sizeBytes: number },
  client: DbClient = db,
): Promise<string> {
  const filename = sanitizeFilename(input.filename)
  if (!filename) {
    throw new AssetValidationError('filename_empty', 'Filename is empty after sanitisation.')
  }
  if (input.sizeBytes > MAX_ASSET_BYTES) {
    throw new AssetValidationError(
      'file_too_large',
      `File exceeds ${MAX_ASSET_BYTES} bytes.`,
    )
  }

  const countRows = await client
    .select({ n: count() })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
  const n = countRows[0]?.n ?? 0
  if (Number(n) >= MAX_ASSETS_PER_DOCUMENT) {
    throw new AssetValidationError(
      'too_many_assets',
      `Document already has ${MAX_ASSETS_PER_DOCUMENT} assets.`,
    )
  }

  const existing = await get(userId, documentId, filename, client)
  if (existing) {
    throw new AssetValidationError(
      'filename_conflict',
      `Asset "${filename}" already exists for this document.`,
    )
  }
  return filename
}

export async function create(
  userId: string,
  documentId: string,
  input: CreateAssetInput,
  client: DbClient = db,
): Promise<AssetMetadata> {
  const filename = await validateNew(userId, documentId, input, client)
  const [row] = await narrow(client)
    .insert(documentAssets)
    .values({
      userId,
      documentId,
      filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      bytes: input.bytes,
      sha256: sha256Hex(input.bytes),
    })
    .returning(METADATA_COLUMNS)
  if (!row) throw new Error('failed to insert document asset')
  return row as AssetMetadata
}

export interface CreateDriveAssetInput {
  /** Already sanitised + validated (see validateNew). */
  filename: string
  mimeType: string
  sizeBytes: number
  sha256: string
  driveFileId: string
  drivePicked?: boolean
}

/** True for a unique-index violation (a concurrent same-name upload). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/**
 * Insert a metadata-only row whose bytes live in Google Drive. Maps a
 * same-name race to `filename_conflict` like `create`.
 */
export async function createDriveBacked(
  userId: string,
  documentId: string,
  input: CreateDriveAssetInput,
  client: DbClient = db,
): Promise<AssetMetadata> {
  try {
    const [row] = await narrow(client)
      .insert(documentAssets)
      .values({
        userId,
        documentId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        bytes: null,
        sha256: input.sha256,
        driveFileId: input.driveFileId,
        drivePicked: input.drivePicked ?? false,
      })
      .returning(METADATA_COLUMNS)
    if (!row) throw new Error('failed to insert document asset')
    return row as AssetMetadata
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AssetValidationError(
        'filename_conflict',
        `Asset "${input.filename}" already exists for this document.`,
      )
    }
    throw err
  }
}

/**
 * Drive migration step: record the Drive copy and clear the bytea in one
 * statement. It only matches a row that still holds bytes with the expected
 * hash, so a concurrent change or a second run can never clear the only copy.
 */
export async function moveBytesToDrive(
  userId: string,
  id: string,
  expectedSha256: string,
  driveFileId: string,
  client: DbClient = db,
): Promise<boolean> {
  const rows = await narrow(client)
    .update(documentAssets)
    .set({ driveFileId, bytes: null, sha256: expectedSha256 })
    .where(
      and(
        eq(documentAssets.userId, userId),
        eq(documentAssets.id, id),
        isNotNull(documentAssets.bytes),
        sql`coalesce(${documentAssets.sha256}, encode(sha256(${documentAssets.bytes}), 'hex')) = ${expectedSha256}`,
      ),
    )
    .returning({ id: documentAssets.id })
  return rows.length > 0
}

export interface PendingDriveMove {
  id: string
  documentId: string
  filename: string
  mimeType: string
  sha256: string
}

/**
 * Next batch of assets still stored in Postgres (metadata + hash, no bytes),
 * oldest first: the Drive migration's work list.
 */
export async function listPendingDriveMoves(
  userId: string,
  limit: number,
  client: DbClient = db,
): Promise<PendingDriveMove[]> {
  return client
    .select({
      id: documentAssets.id,
      documentId: documentAssets.documentId,
      filename: documentAssets.filename,
      mimeType: documentAssets.mimeType,
      sha256: sql<string>`coalesce(${documentAssets.sha256}, encode(sha256(${documentAssets.bytes}), 'hex'))`,
    })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), isNotNull(documentAssets.bytes)))
    .orderBy(documentAssets.createdAt, documentAssets.id)
    .limit(limit)
}

/** How many assets still hold bytes in Postgres. */
export async function countPostgresHeld(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: count() })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), isNotNull(documentAssets.bytes)))
  return Number(row?.n ?? 0)
}

/** Total size of the assets held in Google Drive (from metadata). */
export async function driveTotalBytes(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: sql<string | number>`coalesce(sum(${documentAssets.sizeBytes}), 0)` })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), isNull(documentAssets.bytes)))
  return Number(row?.n ?? 0)
}

export interface AssetHash {
  id: string
  filename: string
  mimeType: string
  sha256: string
  driveFileId: string | null
}

/**
 * Filename + content hash for every asset of a document — the inputs of the
 * LaTeX PDF cache key — without transferring any bytes. Rows uploaded before
 * the sha256 column existed are hashed inside Postgres.
 */
export async function listHashes(
  userId: string,
  documentId: string,
  client: DbClient = db,
): Promise<AssetHash[]> {
  return client
    .select({
      id: documentAssets.id,
      filename: documentAssets.filename,
      mimeType: documentAssets.mimeType,
      sha256: sql<string>`coalesce(${documentAssets.sha256}, encode(sha256(${documentAssets.bytes}), 'hex'))`,
      driveFileId: documentAssets.driveFileId,
    })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
    .orderBy(documentAssets.createdAt)
}

/** Bytes for the given asset ids (scoped to the user). */
export async function bytesByIds(
  userId: string,
  ids: readonly string[],
  client: DbClient = db,
): Promise<Map<string, Buffer>> {
  if (ids.length === 0) return new Map()
  const rows = await client
    .select({ id: documentAssets.id, bytes: documentAssets.bytes })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), inArray(documentAssets.id, [...ids])))
  const out = new Map<string, Buffer>()
  for (const r of rows) if (r.bytes) out.set(r.id, r.bytes)
  return out
}

/** Delete one asset by id (scoped to the user). */
export async function removeById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<boolean> {
  const rows = await narrow(client)
    .delete(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.id, id)))
    .returning({ id: documentAssets.id })
  return rows.length > 0
}

/**
 * Asset bytes held in Postgres for a user (the upload quota's "used").
 * Drive-backed rows cost Neon only metadata and do not count.
 */
export async function totalBytes(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: sql<string | number>`coalesce(sum(${documentAssets.sizeBytes}), 0)` })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), isNotNull(documentAssets.bytes)))
  return Number(row?.n ?? 0)
}

/**
 * Delete an asset by filename. Returns true when a row was removed, false
 * when no matching asset was found.
 */
export async function remove(
  userId: string,
  documentId: string,
  filename: string,
  client: DbClient = db,
): Promise<boolean> {
  const rows = await narrow(client)
    .delete(documentAssets)
    .where(
      and(
        eq(documentAssets.userId, userId),
        eq(documentAssets.documentId, documentId),
        eq(documentAssets.filename, filename),
      ),
    )
    .returning({ id: documentAssets.id })
  return rows.length > 0
}

/**
 * Rename an asset (e.g. after the user renames it in the UI). The new name
 * is sanitised and must not collide with another asset on the same doc.
 */
export async function renameFile(
  userId: string,
  documentId: string,
  oldName: string,
  newName: string,
  client: DbClient = db,
): Promise<AssetMetadata | null> {
  const target = sanitizeFilename(newName)
  if (!target) {
    throw new AssetValidationError('invalid_new_filename', 'New filename is empty after sanitisation.')
  }
  if (target === oldName) {
    return getMeta(userId, documentId, oldName, client)
  }
  const conflict = await get(userId, documentId, target, client)
  if (conflict) {
    throw new AssetValidationError(
      'filename_conflict',
      `Asset "${target}" already exists for this document.`,
    )
  }
  const [row] = await narrow(client)
    .update(documentAssets)
    .set({ filename: target })
    .where(
      and(
        eq(documentAssets.userId, userId),
        eq(documentAssets.documentId, documentId),
        eq(documentAssets.filename, oldName),
      ),
    )
    .returning(METADATA_COLUMNS)
  return (row as AssetMetadata | undefined) ?? null
}
