import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { documents, driveFolders } from '@/lib/db/schema'
import type { DriveClient } from './client'

/**
 * Employ's folder layout in the user's Drive, created lazily and cached by
 * folder id in `drive_folders` so steady-state uploads cost zero lookups:
 *
 *   Employ/
 *     Documents/<doc title>-<id8>/assets
 *     Exports/
 *     PDFs/
 *     CVs/
 */

export const ROOT_FOLDER_NAME = 'Employ'
export const TOP_FOLDERS = {
  documents: 'Documents',
  exports: 'Exports',
  pdfs: 'PDFs',
  cvs: 'CVs',
} as const
export type TopFolder = keyof typeof TOP_FOLDERS

/** Drive folder name for a document: "<title>-<first 8 of id>". */
export function documentFolderName(title: string, documentId: string): string {
  const clean = title
    .replace(/[\\/\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${clean || 'Document'}-${documentId.slice(0, 8)}`
}

export class DriveFolders {
  constructor(
    private readonly userId: string,
    private readonly client: DriveClient,
  ) {}

  async root(): Promise<string> {
    return this.ensure('root', ROOT_FOLDER_NAME, 'root')
  }

  async top(key: TopFolder): Promise<string> {
    return this.ensure(key, TOP_FOLDERS[key], await this.root())
  }

  /** Create the root and every top-level folder (Settings "connect" check). */
  async ensureLayout(): Promise<void> {
    await this.root()
    for (const key of Object.keys(TOP_FOLDERS) as TopFolder[]) await this.top(key)
  }

  /** Employ/Documents/<title-id>/assets for one of the user's documents. */
  async documentAssets(documentId: string): Promise<string> {
    const cached = await this.cached(`doc-assets:${documentId}`)
    if (cached) return cached
    const [doc] = await db
      .select({ title: documents.title })
      .from(documents)
      .where(and(eq(documents.userId, this.userId), eq(documents.id, documentId)))
      .limit(1)
    const docFolder = await this.ensure(
      `doc:${documentId}`,
      documentFolderName(doc?.title ?? '', documentId),
      await this.top('documents'),
    )
    return this.ensure(`doc-assets:${documentId}`, 'assets', docFolder)
  }

  /**
   * Forget every cached folder id, e.g. after the user deleted Employ/ in
   * Drive (an upload into a cached folder then 404s). The next call
   * re-finds or re-creates the layout.
   */
  async invalidate(): Promise<void> {
    await db.delete(driveFolders).where(eq(driveFolders.userId, this.userId))
  }

  private async cached(key: string): Promise<string | null> {
    const [row] = await db
      .select({ id: driveFolders.folderId })
      .from(driveFolders)
      .where(and(eq(driveFolders.userId, this.userId), eq(driveFolders.folderKey, key)))
      .limit(1)
    return row?.id ?? null
  }

  private async ensure(key: string, name: string, parentId: string): Promise<string> {
    const cached = await this.cached(key)
    if (cached) return cached
    // drive.file only sees folders Employ created, so a name match under the
    // same parent is ours (e.g. from before a DB reset): reuse it.
    const id = (await this.client.findFolder(name, parentId)) ?? (await this.client.createFolder(name, parentId))
    await db
      .insert(driveFolders)
      .values({ userId: this.userId, folderKey: key, folderId: id })
      .onConflictDoNothing()
    // A concurrent request may have won the insert; use the stored id.
    return (await this.cached(key)) ?? id
  }
}
