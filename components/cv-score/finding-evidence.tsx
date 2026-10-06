import { Badge } from '@/components/ui/badge'
import type { CvLineRef } from '@/lib/cv-score/types'

/** `text` with the first occurrence of `highlight` wrapped in <mark>. */
function Highlighted({ text, highlight }: { text: string; highlight?: string }) {
  const at = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1
  if (!highlight || at === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-warning-soft px-0.5 text-foreground">{text.slice(at, at + highlight.length)}</mark>
      {text.slice(at + highlight.length)}
    </>
  )
}

interface FindingEvidenceProps {
  evidence: CvLineRef[]
}

/**
 * The exact CV lines a finding is about: line number (1-based, as extracted)
 * and the line text, with the phrase in question highlighted.
 */
export function FindingEvidence({ evidence }: FindingEvidenceProps) {
  if (evidence.length === 0) return null
  return (
    <ol className="mt-1.5 space-y-1" aria-label="Cited lines from your CV" data-testid="finding-evidence">
      {evidence.map((e) => (
        <li key={e.index} className="flex min-w-0 items-start gap-2 text-xs">
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px] font-normal tabular-nums" title={`Line ${e.index + 1}`}>
            L{e.index + 1}
          </Badge>
          <span className="min-w-0 break-words text-muted-foreground">
            <Highlighted text={e.text} highlight={e.highlight} />
          </span>
        </li>
      ))}
    </ol>
  )
}
