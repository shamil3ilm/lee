'use client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { OpeningCandidate } from '@/lib/discovery/manual-import/types'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * Review list for "Add from text or link": one row per opening found, the
 * user ticks what to import and may fix the title or employer. Rows without
 * a link from the pasted text cannot be imported.
 */

export interface ReviewRow extends OpeningCandidate {
  picked: boolean
}

const ATS_LABEL: Readonly<Record<string, string>> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  workday: 'Workday',
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

interface RowProps {
  row: ReviewRow
  onChange: (patch: Partial<ReviewRow>) => void
}

function Row({ row, onChange }: RowProps) {
  const importable = Boolean(row.url) && row.title.trim().length > 0
  return (
    <li className="space-y-2 rounded-lg border bg-card p-3" data-testid="paste-import-row">
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-2"
          checked={row.picked && importable}
          disabled={!importable}
          onChange={(e) => onChange({ picked: e.target.checked })}
          aria-label={`Import ${row.title || 'this opening'}`}
        />
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Job title" aria-label="Job title" />
          <Input value={row.employer} onChange={(e) => onChange({ employer: e.target.value })} placeholder="Employer" aria-label="Employer" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-7 text-xs text-muted-foreground">
        {row.location ? <span>{row.location}</span> : null}
        {row.url ? (
          <a href={row.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary underline-offset-2 hover:underline">
            {hostLabel(row.url)}
          </a>
        ) : (
          <span>No link in the pasted text: can’t import</span>
        )}
        {row.ats ? <Badge variant="success">Details from {ATS_LABEL[row.ats] ?? row.ats}</Badge> : null}
        {row.board ? <Badge variant="neutral">{row.board}: link only</Badge> : null}
        {row.watch ? <Badge variant="info">Watched employer</Badge> : null}
        {row.watch?.nationalsOnly ? <Badge variant="warning">Mostly nationals</Badge> : null}
      </div>
    </li>
  )
}

export function PasteImportReview({ rows, onChange }: { rows: ReviewRow[]; onChange: (key: string, patch: Partial<ReviewRow>) => void }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No openings or links found in that text.</p>
  }
  return (
    <ul className="space-y-2" aria-label="Openings found">
      {rows.map((r) => (
        <Row key={r.key} row={r} onChange={(patch) => onChange(r.key, patch)} />
      ))}
    </ul>
  )
}
