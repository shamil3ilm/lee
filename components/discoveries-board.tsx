'use client'
import * as React from 'react'
import Link from 'next/link'
import { Briefcase, ExternalLink, MapPin } from 'lucide-react'
import { moveDiscovery } from '@/app/(authed)/discoveries/actions'
import { Board, type BoardColumnDef, type BoardQuickAction } from '@/components/board/board'
import { Badge } from '@/components/ui/badge'
import type { BadgeVariant } from '@/lib/ui/status'

export type DiscoveryBoardColumn = 'new' | 'shortlisted' | 'saved' | 'dismissed'

export interface DiscoveryBoardItem {
  id: string
  version: string
  status: DiscoveryBoardColumn
  title: string
  companyName: string
  location: string | null
  remoteType: string | null
  matchScore: number | null
  applyUrl: string | null
  savedApplicationId: string | null
}

export const DISCOVERY_BOARD_COLUMNS: readonly BoardColumnDef<DiscoveryBoardColumn>[] = [
  { id: 'new', title: 'New', tone: 'info', emptyText: 'Inbox zero', hint: 'Fresh from your sources' },
  {
    id: 'shortlisted',
    title: 'Shortlisted',
    tone: 'interview',
    hint: 'Worth a closer look before applying',
    emptyText: 'Shortlist promising roles here',
  },
  {
    id: 'saved',
    title: 'Applied',
    tone: 'applied',
    hint: 'Moved into your applications pipeline',
    emptyText: 'Drop a role here to add it to your pipeline',
  },
  {
    id: 'dismissed',
    title: 'Dismissed',
    tone: 'neutral',
    defaultCollapsed: true,
    emptyText: 'Nothing dismissed',
  },
]

function scoreVariant(score: number): BadgeVariant {
  if (score >= 80) return 'success'
  if (score >= 60) return 'info'
  return 'neutral'
}

function renderCard(d: DiscoveryBoardItem): React.ReactNode {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium leading-tight">{d.companyName}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.title}</div>
        </div>
        {d.matchScore !== null ? (
          <Badge variant={scoreVariant(d.matchScore)} className="shrink-0 tabular-nums" title="Match score">
            {d.matchScore}
          </Badge>
        ) : null}
      </div>
      {d.location || d.remoteType ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {d.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {d.location}
            </span>
          ) : null}
          {d.remoteType ? (
            <Badge variant="outline" className="text-[10px] capitalize">
              {d.remoteType}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function cardActions(d: DiscoveryBoardItem): BoardQuickAction[] {
  const actions: BoardQuickAction[] = []
  if (d.savedApplicationId) {
    actions.push({ label: 'Open application', icon: Briefcase, href: `/applications/${d.savedApplicationId}` })
  }
  if (d.applyUrl) {
    actions.push({ label: 'Open job posting', icon: ExternalLink, href: d.applyUrl, external: true })
  }
  return actions
}

const SUCCESS: Record<DiscoveryBoardColumn, string> = {
  new: 'Back in New',
  shortlisted: 'Shortlisted',
  saved: 'Saved to pipeline',
  dismissed: 'Dismissed',
}

interface DiscoveriesBoardProps {
  items: Record<DiscoveryBoardColumn, DiscoveryBoardItem[]>
  totals: Record<DiscoveryBoardColumn, number>
}

/**
 * Discovery triage board. Columns are capped server-side (like the inbox
 * pages); the footer links to the full list for that status. Quarantined
 * (likely scam) roles never reach the board.
 */
export function DiscoveriesBoard({ items, totals }: DiscoveriesBoardProps) {
  return (
    <Board
      id="discoveries"
      label="Discoveries triage board"
      columns={DISCOVERY_BOARD_COLUMNS}
      items={items}
      totals={totals}
      columnFooter={(column, shown, total) =>
        total > shown ? (
          <Link
            href={`/discoveries?status=${column}&view=list`}
            className="hover:text-foreground hover:underline"
          >
            Showing {shown} of {total}. Open the full list
          </Link>
        ) : null
      }
      itemLabel={(d) => `${d.companyName}: ${d.title}`}
      renderCard={renderCard}
      cardHref={(d) => (d.savedApplicationId ? `/applications/${d.savedApplicationId}` : null)}
      cardActions={cardActions}
      canMove={(d) =>
        d.status === 'saved' ? 'It is already in your pipeline; manage it from Applications.' : null
      }
      applyMove={(d, to) => ({ ...d, status: to })}
      onMove={(d, _from, to) => moveDiscovery(d.id, to)}
      successMessage={(_d, to) => SUCCESS[to.id]}
    />
  )
}
