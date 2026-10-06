/**
 * When the weekly digest goes out. The daily scheduler cron
 * (`/api/cron/schedule`, "0 9 * * *" in vercel.json) runs at 09:00 UTC and
 * sends the digest to users for whom it is Monday in their own timezone.
 * A unit test keeps this constant and vercel.json in step.
 */
export const DIGEST_SEND_UTC_HOUR = 9

/** Today's send instant (09:00 UTC); show it in the user's timezone. */
export function digestSendInstant(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DIGEST_SEND_UTC_HOUR))
}
