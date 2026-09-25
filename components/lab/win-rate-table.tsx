import { Trophy } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { fmtPct } from '@/lib/lab/format'
import type { WinRateRow } from '@/lib/db/queries/labRuns'

/** Personal model leaderboard built from blind Arena votes. */
export function WinRateTable({ rows }: { rows: WinRateRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No blind votes yet"
        description="Run the Arena in blind mode and pick a winner to build your leaderboard."
        className="py-10"
      />
    )
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 text-right font-medium">Wins</th>
            <th className="px-3 py-2 text-right font-medium">Runs</th>
            <th className="px-3 py-2 text-right font-medium">Win rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={`${r.provider}:${r.model}`}>
              <td className="max-w-[16rem] px-3 py-2">
                <p className="truncate font-medium" title={r.model}>
                  {r.model}
                </p>
                <p className="text-xs text-muted-foreground">{r.provider}</p>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.wins}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.appearances}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtPct(r.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
