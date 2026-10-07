/**
 * Browser side of a variant's "Make PDF": fetch the document's PDF route
 * (which compiles through lib/latex/pdf-cache.ts, or serves the cache) with
 * a hard client deadline, and turn every outcome into a user-facing message.
 * The route itself gives up after its 45 s compile budget; the client
 * deadline only covers a request that never comes back at all.
 */

/** Above the route's 60 s maxDuration, so the server's own answer wins. */
export const PDF_CLIENT_TIMEOUT_MS = 75_000

export type PdfFailureReason = 'compile' | 'unavailable' | 'timeout' | 'cancelled' | 'other'

export type PdfFetchResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: PdfFailureReason; message: string }

export const PDF_MESSAGES: Readonly<Record<PdfFailureReason, string>> = {
  compile: 'The PDF did not compile. Open it in the LaTeX editor to see the log.',
  unavailable: 'The compile service is not answering right now. Try again in a minute.',
  timeout: 'The compile took too long and was stopped. Try again in a minute.',
  cancelled: 'PDF cancelled.',
  other: 'The PDF could not be made. Try again.',
}

function fail(reason: PdfFailureReason): PdfFetchResult {
  return { ok: false, reason, message: PDF_MESSAGES[reason] }
}

export function variantPdfUrl(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/pdf`
}

export interface FetchVariantPdfOptions {
  /** The user's Cancel. */
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function fetchVariantPdf(documentId: string, opts: FetchVariantPdfOptions = {}): Promise<PdfFetchResult> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? PDF_CLIENT_TIMEOUT_MS)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(variantPdfUrl(documentId), { signal, cache: 'no-store' })
    if (res.status === 422) return fail('compile')
    if (res.status === 429 || res.status >= 500) return fail('unavailable')
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('pdf')) return fail('other')
    const body = await res.arrayBuffer()
    return { ok: true, bytes: body.byteLength }
  } catch {
    if (opts.signal?.aborted) return fail('cancelled')
    if (timeout.aborted) return fail('timeout')
    return fail('unavailable')
  }
}
