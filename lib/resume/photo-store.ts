import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as documentsQ from '@/lib/db/queries/documents'
import { getAssetStoreForUser, type AssetStore } from '@/lib/storage/asset-store'
import { photoFilename, validatePhotoBytes, type PhotoStoredType } from './photo'

/**
 * The profile photo, stored through the existing document-asset store
 * (Google Drive when connected, else Postgres) on a hidden holder document
 * of kind `profile_photo` — one per user. It is PRIVATE: it never leaves
 * lee through Publish; it is only copied into a variant's LaTeX document
 * when that variant's Photo toggle is on (and its region allows a photo).
 */

export const PHOTO_DOCUMENT_TITLE = 'Profile photo'

export class PhotoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoError'
  }
}

export interface ProfilePhoto {
  documentId: string
  filename: string
  mimeType: PhotoStoredType
  sha256: string
  /** Asset metadata for reading the bytes through the store. */
  asset: assetsQ.AssetHash
}

async function holder(userId: string): Promise<string | null> {
  const [doc] = await documentsQ.list(userId, { kind: 'profile_photo' })
  return doc?.id ?? null
}

async function ensureHolder(userId: string): Promise<string> {
  const existing = await holder(userId)
  if (existing) return existing
  const doc = await documentsQ.create(userId, {
    applicationId: null,
    kind: 'profile_photo',
    version: 1,
    title: PHOTO_DOCUMENT_TITLE,
    content: {},
  })
  return doc.id
}

function isPhotoAsset(a: { filename: string }): boolean {
  return a.filename === photoFilename('image/jpeg') || a.filename === photoFilename('image/png')
}

export async function getProfilePhoto(userId: string): Promise<ProfilePhoto | null> {
  const documentId = await holder(userId)
  if (!documentId) return null
  const asset = (await assetsQ.listHashes(userId, documentId)).find(isPhotoAsset)
  if (!asset) return null
  const mimeType: PhotoStoredType = asset.filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return { documentId, filename: asset.filename, mimeType, sha256: asset.sha256, asset }
}

async function deleteAssets(userId: string, store: AssetStore, documentId: string, match: (a: { filename: string }) => boolean): Promise<void> {
  for (const a of (await assetsQ.list(userId, documentId)).filter(match)) {
    await store.delete(userId, store.refForDocumentAsset(a))
  }
}

/** Validate and store a (client-cropped) photo, replacing the previous one. */
export async function saveProfilePhoto(userId: string, bytes: Buffer, store?: AssetStore): Promise<ProfilePhoto> {
  const check = validatePhotoBytes(bytes)
  if (!check.ok) throw new PhotoError(check.error)
  const s = store ?? (await getAssetStoreForUser(userId))
  const documentId = await ensureHolder(userId)
  await deleteAssets(userId, s, documentId, isPhotoAsset)
  await s.put(userId, { kind: 'document-asset', documentId, filename: photoFilename(check.type) }, bytes, { mimeType: check.type })
  const saved = await getProfilePhoto(userId)
  if (!saved) throw new Error('profile photo was not stored')
  return saved
}

export async function removeProfilePhoto(userId: string, store?: AssetStore): Promise<boolean> {
  const documentId = await holder(userId)
  if (!documentId) return false
  const s = store ?? (await getAssetStoreForUser(userId))
  const before = (await assetsQ.list(userId, documentId)).filter(isPhotoAsset).length
  await deleteAssets(userId, s, documentId, isPhotoAsset)
  return before > 0
}

export async function readProfilePhoto(userId: string, photo: ProfilePhoto, store?: AssetStore): Promise<Buffer | null> {
  const s = store ?? (await getAssetStoreForUser(userId))
  return s.get(userId, s.refForDocumentAsset({ id: photo.asset.id, driveFileId: photo.asset.driveFileId }))
}

/**
 * Make a variant's LaTeX document carry exactly the photo it needs: a copy
 * of the profile photo (same bytes, by sha256) when `photo` is given,
 * nothing otherwise. The copy is what the existing pipeline tars up for
 * latexonline.cc, and its hash is part of the PDF cache key.
 */
export async function syncVariantPhoto(
  userId: string,
  documentId: string,
  photo: ProfilePhoto | null,
  store?: AssetStore,
): Promise<void> {
  const current = (await assetsQ.listHashes(userId, documentId)).filter(isPhotoAsset)
  if (photo && current.length === 1 && current[0]!.filename === photo.filename && current[0]!.sha256 === photo.sha256) return
  if (!photo && current.length === 0) return
  const s = store ?? (await getAssetStoreForUser(userId))
  await deleteAssets(userId, s, documentId, isPhotoAsset)
  if (!photo) return
  const bytes = await readProfilePhoto(userId, photo, s)
  if (!bytes) throw new PhotoError('The profile photo could not be read. Upload it again.')
  await s.put(userId, { kind: 'document-asset', documentId, filename: photo.filename }, bytes, { mimeType: photo.mimeType })
}
