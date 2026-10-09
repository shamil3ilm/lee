import { verifyAlertSender } from '@/lib/email-alerts/sender'

/**
 * A LinkedIn notification email is read only when Google verified it came
 * from linkedin.com: a passing DMARC result for the From domain, or a
 * passing DKIM signature from linkedin.com, in the Authentication-Results
 * header mx.google.com added on receipt. The same check as the job alerts
 * (lib/email-alerts/sender.ts), so a spoofed "LinkedIn" email can't plant
 * hiring posts.
 */
export function verifyLinkedInSender(from: string | undefined, authResults: readonly string[]): boolean {
  return verifyAlertSender(from, authResults)?.site.id === 'linkedin'
}

/** Gmail search for LinkedIn's member notifications about posts (not job alerts). */
export function linkedInPostQuery(days: number): string {
  return `from:linkedin.com newer_than:${days}d subject:(posted OR post OR posts OR shared OR reposted OR hiring OR trending OR network) -subject:("job alert" OR "jobs alert")`
}
