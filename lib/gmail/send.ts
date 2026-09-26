import { getGoogleTokens } from '@/lib/google/tokens'
import { fetchWithTimeout, GMAIL_TIMEOUT_MS } from '@/lib/net/timeout'

export interface SendEmailArgs {
  userId: string
  to: string
  subject: string
  htmlBody: string
  textBody?: string
}

export interface SendEmailResult {
  messageId: string
}

/**
 * base64url encode per RFC 4648 §5 — the Gmail API `raw` field expects the
 * URL-safe alphabet (`+`→`-`, `/`→`_`) with padding stripped.
 */
function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Quote a header value that may contain unicode. Anything non-ASCII goes into
 * an RFC 2047 encoded-word so recipients don't see mojibake in the subject.
 */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  const b64 = Buffer.from(value, 'utf8').toString('base64')
  return `=?UTF-8?B?${b64}?=`
}

/**
 * Build an RFC 2822 multipart/alternative message body suitable for the Gmail
 * API `users.messages.send` endpoint. Includes a plain-text fallback for
 * clients that cannot render HTML.
 */
export function buildRawMessage(args: {
  to: string
  subject: string
  htmlBody: string
  textBody?: string
}): string {
  const boundary = `----=_Part_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const text = args.textBody ?? htmlToText(args.htmlBody)
  const lines = [
    `To: ${args.to}`,
    `Subject: ${encodeHeader(args.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    args.htmlBody,
    '',
    `--${boundary}--`,
    '',
  ]
  return lines.join('\r\n')
}

/**
 * Strip HTML tags for the text/plain fallback. Not a real HTML parser — good
 * enough for our generated templates which are structural, not creative.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Send an email from the user's Gmail account. Uses Gmail API v1
 * `users.messages.send` with the token retrieved via getGoogleTokens
 * (auto-refreshes when expired). Requires the `gmail.send` scope granted at
 * sign-in — pre-v4 users must re-consent.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const tokens = await getGoogleTokens(args.userId)
  const raw = buildRawMessage({
    to: args.to,
    subject: args.subject,
    htmlBody: args.htmlBody,
    textBody: args.textBody,
  })
  const encoded = base64UrlEncode(raw)

  const res = await fetchWithTimeout(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    },
    { timeoutMs: GMAIL_TIMEOUT_MS, label: 'gmail send' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gmail send ${res.status}: ${detail.slice(0, 400)}`)
  }
  const json = (await res.json()) as { id?: string }
  if (!json.id) throw new Error('gmail send: response missing message id')
  return { messageId: json.id }
}
