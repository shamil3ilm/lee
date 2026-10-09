import * as capturesQ from '@/lib/db/queries/postCaptures'
import { logger } from '@/lib/logger'
import { CAPTURE_TTL_MS, MAX_CAPTURE_BODY_BYTES, parseCaptureForm, verifyCaptureKey } from './capture'

/**
 * SERVER-ONLY. POST /api/capture, the "Send to lee" bookmarklet's target.
 * Form-encoded body only (the page's selection, its URL and the user's
 * capture key); nothing is ever read from the query string. A valid
 * request parks the capture for 30 minutes and redirects (303) to
 * /discoveries/capture, where the signed-in user reviews it.
 */

export const CAPTURE_PAGE = '/discoveries/capture'

export interface CaptureDeps {
  keyVersion: (userId: string) => Promise<number>
  create: typeof capturesQ.create
  now: () => Date
}

const defaultDeps: CaptureDeps = { keyVersion: capturesQ.keyVersion, create: capturesQ.create, now: () => new Date() }

const NO_STORE = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }

function fail(status: number, message: string): Response {
  return new Response(`${message}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE } })
}

export async function handleCapture(req: Request, deps: CaptureDeps = defaultDeps): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'Use the Send to lee bookmarklet.')
  // The bookmarklet's data travels in the body only.
  if (new URL(req.url).search) return fail(400, 'Nothing may be sent in the link.')
  const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (type !== 'application/x-www-form-urlencoded') return fail(415, 'Send the form from the bookmarklet.')
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_CAPTURE_BODY_BYTES) return fail(413, 'That selection is too long. Select just the post.')
  const body = await req.text()
  if (Buffer.byteLength(body) > MAX_CAPTURE_BODY_BYTES) return fail(413, 'That selection is too long. Select just the post.')
  const capture = parseCaptureForm(Object.fromEntries(new URLSearchParams(body)))
  if (!capture) return fail(400, 'Select the post text first, then click Send to lee.')
  const owner = verifyCaptureKey(capture.key)
  if (!owner || owner.version !== (await deps.keyVersion(owner.userId))) {
    return fail(401, 'This bookmarklet is no longer valid. Drag the new one from Settings › LinkedIn.')
  }
  try {
    await deps.create(owner.userId, { text: capture.text, url: capture.url, expiresAt: new Date(deps.now().getTime() + CAPTURE_TTL_MS) })
  } catch (err) {
    logger.error('post_capture_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return fail(500, 'Could not keep that capture. Try again, or copy and paste the post.')
  }
  logger.info('post_capture_received', { userId: owner.userId, chars: capture.text.length, hasUrl: Boolean(capture.url) })
  return new Response(null, { status: 303, headers: { location: new URL(CAPTURE_PAGE, req.url).toString(), ...NO_STORE } })
}
