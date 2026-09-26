import { createHash } from 'node:crypto'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { compileLatex, type CompileOptions, type CompileResult } from '@/lib/latex/compile'
import { getAssetStoreForUser, MAX_PDF_CACHE_BYTES, type AssetStore } from '@/lib/storage/asset-store'
import { logger } from '@/lib/logger'
import { withDraftMode } from '@/lib/latex/draft'

/**
 * Compiled-PDF cache for LaTeX documents. The key is a sha256 over the .tex
 * source plus every asset's (filename, sha256), so it can be computed from
 * metadata alone — a cache hit reads one small row and never touches asset
 * bytes or the external compile service. One entry per document (the store
 * overwrites on a new key), so storage stays bounded.
 */

// Bump when the compile pipeline changes in a way that alters output.
const CACHE_VERSION = 'v1'

export interface HashedAsset {
  filename: string
  sha256: string
}

export function latexCacheKey(source: string, assets: readonly HashedAsset[]): string {
  const h = createHash('sha256')
  h.update(`${CACHE_VERSION}\0${source}\0`)
  const sorted = [...assets].sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0))
  for (const a of sorted) h.update(`${a.filename}\0${a.sha256}\0`)
  return h.digest('hex')
}

/** Current cache key for a document's saved source + assets (metadata only). */
export async function documentCacheKey(
  userId: string,
  documentId: string,
  source: string,
): Promise<{ cacheKey: string; assets: assetsQ.AssetHash[] }> {
  const assets = await assetsQ.listHashes(userId, documentId)
  return { cacheKey: latexCacheKey(source, assets), assets }
}

export type CompiledPdf =
  | { ok: true; pdf: Buffer; cacheKey: string; cached: boolean }
  | { ok: false; status: number; log: string; cacheKey: string }

export interface CompileDocumentPdfInput {
  userId: string
  documentId: string
  source: string
  /**
   * Draft mode (graphicx `draft`): compiles the draft source under its own
   * key and never writes the cache, so the final PDF stays cached.
   */
  draft?: boolean
  /** Injected for tests; defaults to the latexonline.cc client. */
  compile?: (input: CompileOptions) => Promise<CompileResult>
  store?: AssetStore
}

export async function compileDocumentPdf(input: CompileDocumentPdfInput): Promise<CompiledPdf> {
  const store = input.store ?? (await getAssetStoreForUser(input.userId))
  const compile = input.compile ?? compileLatex
  const source = input.draft ? withDraftMode(input.source) : input.source
  const { cacheKey, assets } = await documentCacheKey(input.userId, input.documentId, source)

  const cached = input.draft
    ? null
    : await store.get(input.userId, store.refForPdfCache(input.documentId, cacheKey))
  if (cached) return { ok: true, pdf: cached, cacheKey, cached: true }

  // Miss: only now load asset bytes (one query) and call the compile service.
  const refs = assets.map((a) => store.refForDocumentAsset(a))
  const bytes = await store.getMany(input.userId, refs)
  const result = await compile({
    source,
    assets: assets.flatMap((a, i) => {
      const b = bytes.get(refs[i]!)
      return b ? [{ filename: a.filename, mimeType: a.mimeType, bytes: b }] : []
    }),
  })
  if (!result.ok) return { ok: false, status: result.status, log: result.log, cacheKey }

  const pdf = Buffer.from(result.pdf)
  if (!input.draft && pdf.byteLength <= MAX_PDF_CACHE_BYTES) {
    try {
      await store.put(
        input.userId,
        { kind: 'pdf-cache', documentId: input.documentId },
        pdf,
        { mimeType: 'application/pdf', cacheKey },
      )
    } catch (err) {
      // Best effort: a cache write failure must never fail the response.
      logger.error('latex_pdf_cache_write_failed', {
        documentId: input.documentId,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { ok: true, pdf, cacheKey, cached: false }
}
