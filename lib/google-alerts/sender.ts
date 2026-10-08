/**
 * Google Alerts emails are only read when Gmail's own receiving server
 * (mx.google.com) recorded DMARC pass for google.com, or a DKIM pass signed
 * by google.com — the same proof the other job-alert senders need
 * (lib/email-alerts/sender.ts). A forged "alert" can't plant postings.
 */

export const GOOGLE_ALERTS_SENDER = 'googlealerts-noreply@google.com'

function passesForGoogle(result: string): boolean {
  for (const m of result.matchAll(/\bdmarc=pass\b[^;]*?\bheader\.from=([a-z0-9.-]+)/gi)) {
    if (m[1]?.toLowerCase() === 'google.com') return true
  }
  for (const m of result.matchAll(/\bdkim=pass\b[^;]*?\bheader\.(?:i=@?|d=)([a-z0-9.-]+)/gi)) {
    if (m[1]?.toLowerCase() === 'google.com') return true
  }
  return false
}

export function verifyGoogleAlertSender(from: string | undefined, authResults: readonly string[]): boolean {
  if (!from || from.trim().toLowerCase() !== GOOGLE_ALERTS_SENDER) return false
  return authResults.filter((v) => /^\s*mx\.google\.com\s*;/i.test(v)).some(passesForGoogle)
}
