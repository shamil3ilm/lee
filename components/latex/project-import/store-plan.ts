'use client'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'
import { uploadAsset } from '@/components/drive/asset-upload'
import { assetUrl, basename } from '@/lib/latex/project/paths'
import type { PlannedFile } from '@/lib/latex/project/plan'

/**
 * Store an import plan's files as document assets: one request per file
 * (a few in parallel), so no request comes near the 4.5 MB function body
 * limit; with Google Drive the bytes go straight to Drive. Each file goes
 * through the existing caps (5 MB per file, files per document, the
 * per-user quota); a file the server refuses is reported, not retried.
 */

export interface StoreFailure {
  path: string
  error: string
}

export interface StoreOutcome {
  created: AssetMetadata[]
  failures: StoreFailure[]
}

const CONCURRENCY = 3

export async function storePlannedFiles(
  documentId: string,
  files: readonly PlannedFile[],
  onProgress: (done: number, total: number) => void,
): Promise<StoreOutcome> {
  const created: AssetMetadata[] = []
  const failures: StoreFailure[] = []
  let next = 0
  let done = 0
  onProgress(0, files.length)
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++]!
      const bytes = new Uint8Array(f.bytes.byteLength)
      bytes.set(f.bytes)
      const out = await uploadAsset(documentId, new File([bytes], basename(f.path), { type: f.mimeType }), f.path)
      if (out.asset) created.push(out.asset)
      else failures.push({ path: f.path, error: out.error ?? 'Upload failed.' })
      onProgress(++done, files.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker))
  return { created, failures }
}

/** Delete assets by path ("Replace project"); returns the paths that could not be deleted. */
export async function deleteAssets(documentId: string, paths: readonly string[]): Promise<string[]> {
  const failed: string[] = []
  for (const path of paths) {
    const res = await fetch(assetUrl(documentId, path), { method: 'DELETE' }).catch(() => null)
    if (!res?.ok && res?.status !== 404) failed.push(path)
  }
  return failed
}
