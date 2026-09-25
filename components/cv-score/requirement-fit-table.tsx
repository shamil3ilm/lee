import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { FeedbackButtons } from '@/components/feedback-buttons'
import type { RequirementFitDetails } from '@/lib/cv-score/requirement-fit'

const STATUS_TONE = { met: 'emerald', partial: 'violet', missing: 'rose' } as const

interface RequirementFitTableProps {
  details: RequirementFitDetails
  aiCallId: string | null
}

/** Per-requirement AI assessment with verified-evidence badges + rating. */
export function RequirementFitTable({ details, aiCallId }: RequirementFitTableProps) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Requirement</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Evidence from your CV</th>
            </tr>
          </thead>
          <tbody>
            {details.items.map((it, i) => (
              <tr key={`${i}-${it.requirement}`} className="border-b align-top last:border-0">
                <td className="py-2 pr-3">{it.requirement}</td>
                <td className="py-2 pr-3">
                  <Badge variant={STATUS_TONE[it.status]}>{it.status}</Badge>
                </td>
                <td className="space-y-1 py-2 text-xs">
                  {it.evidence ? (
                    <p className={it.evidenceVerified ? '' : 'text-muted-foreground line-through'}>“{it.evidence}”</p>
                  ) : null}
                  {it.evidenceVerified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" /> quote verified in your CV
                    </span>
                  ) : it.downgradedFrom ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="size-3.5" /> quote not found — downgraded from {it.downgradedFrom}
                    </span>
                  ) : null}
                  {it.suggestion ? <p className="text-muted-foreground">{it.suggestion}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aiCallId ? (
        <FeedbackButtons
          documentId={aiCallId}
          rateUrl={`/api/ai-calls/${aiCallId}/rate`}
          caption="Was this AI requirement check accurate?"
        />
      ) : null}
    </div>
  )
}
