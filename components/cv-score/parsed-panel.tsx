import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RoleKind } from '@/lib/cv-score/career'
import type { ImpactDetails } from '@/lib/cv-score/dimensions/impact'
import type { StructureDetails } from '@/lib/cv-score/dimensions/structure'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2025-12" → "Dec 2025"; "present" → "Present". */
function ym(v: string | undefined): string {
  if (!v) return '?'
  if (v === 'present') return 'Present'
  const m = /^(\d{4})-(\d{2})$/.exec(v)
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}` : v
}

const KIND: Record<RoleKind, { label: string; variant: 'success' | 'info' | 'neutral' }> = {
  engineering: { label: 'Full-time', variant: 'success' },
  internship: { label: 'Internship · ½', variant: 'info' },
  other: { label: 'Not counted', variant: 'neutral' },
}

const months = (n: number): string => `${n} month${n === 1 ? '' : 's'}`

interface ParsedPanelProps {
  structure: StructureDetails
  impact: ImpactDetails | null
}

/**
 * "How we read your CV": the roles the parser found, how experience years
 * were counted, and how the bullets were quantified — so a wrong score can
 * be traced to a wrong parse.
 */
export function ParsedPanel({ structure, impact }: ParsedPanelProps) {
  const exp = structure.experience
  const roles = structure.roles ?? []
  return (
    <div className="space-y-4 text-sm" data-testid="cv-parsed-panel">
      {exp ? (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Experience counted</h4>
          <p>
            <span className="font-semibold tabular-nums">{exp.years} years</span> of engineering experience
            {exp.allRolesCounted ? ' (no engineering roles found, so every role counts)' : ''}.
          </p>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            <li><Badge variant="success">{months(exp.fullTimeMonths)} full-time</Badge></li>
            {exp.internshipMonths ? <li><Badge variant="info">{months(exp.internshipMonths)} internships, counted at half</Badge></li> : null}
            {exp.otherMonths ? <li><Badge variant="neutral">{months(exp.otherMonths)} in other roles, not counted</Badge></li> : null}
          </ul>
          {structure.pageNormReason ? (
            <p className="text-xs text-muted-foreground">
              Length: about {structure.pages} page{structure.pages === 1 ? '' : 's'}; {structure.pageNormReason}.
            </p>
          ) : null}
        </section>
      ) : null}

      {roles.length ? (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roles found</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Counted as</TableHead>
                  <TableHead className="text-right">Bullets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r, i) => (
                  <TableRow key={`${i}-${r.title}`}>
                    <TableCell className="font-medium">{r.title || '—'}</TableCell>
                    <TableCell>{r.company || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{ym(r.start)} – {ym(r.end)}</TableCell>
                    <TableCell><Badge variant={KIND[r.kind].variant}>{KIND[r.kind].label}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.bullets}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {impact && impact.bullets ? (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bullets</h4>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            <li><Badge variant="outline">{impact.bullets} bullets</Badge></li>
            <li><Badge variant="success">{impact.quantifiedOutcome ?? 0} quantified (outcome)</Badge></li>
            <li><Badge variant="info">{impact.quantifiedScope ?? 0} quantified (scope)</Badge></li>
            <li><Badge variant="neutral">{impact.bullets - impact.quantified} with no number</Badge></li>
          </ul>
        </section>
      ) : null}
    </div>
  )
}
