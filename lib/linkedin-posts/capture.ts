import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { canonicalPostUrl } from './urls'

/**
 * SERVER-ONLY. "Send to lee" bookmarklet: the per-user capture key it
 * carries, and the validation of what it posts.
 *
 * The bookmarklet POSTs a form (never a query string: no personal data in
 * URLs) from the page the user is on, so the browser does not send lee's
 * SameSite=Lax session cookie with it. The key authenticates the request
 * instead: `<userId>.<version>.<HMAC-SHA256(AUTH_SECRET, …)>`, derived (not
 * stored) and revoked by bumping the version (Settings › LinkedIn). A
 * forged or cross-site POST without the key is refused, and a valid one
 * only parks the text for the user's review: nothing is imported until the
 * user clicks Add on the authenticated capture page.
 */

export const MAX_CAPTURE_TEXT = 4_000
export const MAX_CAPTURE_URL = 2_000
/** Whole request body (form-encoded text + URL + key, with escaping headroom). */
export const MAX_CAPTURE_BODY_BYTES = 40_000
export const CAPTURE_TTL_MS = 30 * 60_000

const KEY_LABEL = 'lee-capture-key:v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET is missing or too short')
  return s
}

function mac(userId: string, version: number, key: string): string {
  return createHmac('sha256', key).update(`${KEY_LABEL}:${userId}:${version}`).digest('base64url')
}

export function captureKey(userId: string, version: number, key: string = secret()): string {
  return `${userId}.${version}.${mac(userId, version, key)}`
}

/** The user and key version a capture key was made for, or null when forged / malformed. */
export function verifyCaptureKey(token: unknown, key: string = secret()): { userId: string; version: number } | null {
  if (typeof token !== 'string' || token.length > 200) return null
  const [userId, v, sig, ...rest] = token.split('.')
  if (rest.length > 0 || !userId || !v || !sig || !UUID_RE.test(userId) || !/^\d{1,6}$/.test(v)) return null
  const version = Number(v)
  const expected = Buffer.from(mac(userId, version, key))
  const got = Buffer.from(sig)
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null
  return { userId, version }
}

const httpUrl = z
  .string()
  .trim()
  .max(MAX_CAPTURE_URL)
  .refine((v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  })

export const captureFormSchema = z.object({
  k: z.string().min(1).max(200),
  text: z.string().max(MAX_CAPTURE_TEXT * 2).default(''),
  url: z.union([httpUrl, z.literal('')]).default(''),
})

export interface CapturePayload {
  key: string
  text: string
  url: string | null
}

/**
 * The page link as it may be kept: a LinkedIn post in its canonical form,
 * any other page without its query and fragment (they can carry tracking
 * or sign-in tokens).
 */
export function storableUrl(raw: string): string {
  const post = canonicalPostUrl(raw)
  if (post) return post.url
  const u = new URL(raw)
  u.search = ''
  u.hash = ''
  u.username = ''
  u.password = ''
  return u.toString()
}

/** Form fields → a capture, or null when invalid or empty. Text beyond the cap is cut. */
export function parseCaptureForm(fields: Record<string, unknown>): CapturePayload | null {
  const parsed = captureFormSchema.safeParse(fields)
  if (!parsed.success) return null
  const text = parsed.data.text.replace(/\r\n/g, '\n').trim().slice(0, MAX_CAPTURE_TEXT)
  const url = parsed.data.url ? storableUrl(parsed.data.url) : null
  if (!text && !url) return null
  return { key: parsed.data.k, text, url }
}
