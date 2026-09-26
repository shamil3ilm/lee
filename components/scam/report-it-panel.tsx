import { Flag } from 'lucide-react'

/**
 * v17 §1 — official reporting channels as plain text (no mailto/links, so
 * nothing is sent or opened on the user's behalf).
 */
export function ReportItPanel({ board }: { board: string | null }) {
  return (
    <section aria-labelledby="scam-report-it" className="rounded-md border bg-muted/30 p-3 text-sm">
      <h3 id="scam-report-it" className="mb-2 flex items-center gap-1.5 font-semibold">
        <Flag className="size-4" aria-hidden="true" />
        Report it
      </h3>
      <ul className="space-y-1.5 text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">India:</span> National Cyber Crime Reporting
          Portal — cybercrime.gov.in · helpline 1930
        </li>
        <li>
          <span className="font-medium text-foreground">Job board:</span>{' '}
          {board
            ? `use the “Report job” option on ${board} for this posting`
            : 'use the “Report job” option on the site where you found this posting'}
        </li>
        <li>
          <span className="font-medium text-foreground">US:</span> FTC — reportfraud.ftc.gov
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Never pay a fee, share an OTP or send ID documents to get a job.
      </p>
    </section>
  )
}
