import { and, count, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { documentAssets } from '@/lib/db/schema'

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
  createdAt: documentAssets.createdAt,
} as const

export type AssetMetadata = {
  id: string
  userId: string
  documentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: Date
}

export type AssetWithBytes = AssetMetadata & { bytes: Buffer }

export interface CreateAssetInput {
  filename: string
  mimeType: string
  sizeBytes: number
  bytes: Buffer
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
  constructor(
    code:
      | 'filename_empty'
      | 'file_too_large'
      | 'too_many_assets'
      | 'filename_conflict'
      | 'invalid_new_filename',
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
  return client
    .select(METADATA_COLUMNS)
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
    .orderBy(documentAssets.createdAt)
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
  return row ?? null
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
  return row ?? null
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
  return client
    .select()
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
    .orderBy(documentAssets.createdAt)
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
export async function create(
  userId: string,
  documentId: string,
  input: CreateAssetInput,
  client: DbClient = db,
): Promise<AssetMetadata> {
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

  const [{ n }] = await client
    .select({ n: count() })
    .from(documentAssets)
    .where(and(eq(documentAssets.userId, userId), eq(documentAssets.documentId, documentId)))
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

  const [row] = await client
    .insert(documentAssets)
    .values({
      userId,
      documentId,
      filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      bytes: input.bytes,
    })
    .returning(METADATA_COLUMNS)
  if (!row) throw new Error('failed to insert document asset')
  return row
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
  const rows = await client
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
    return get(userId, documentId, oldName, client)
  }
  const conflict = await get(userId, documentId, target, client)
  if (conflict) {
    throw new AssetValidationError(
      'filename_conflict',
      `Asset "${target}" already exists for this document.`,
    )
  }
  const [row] = await client
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
  return row ?? null
}
