'use client'
import * as React from 'react'
import Link from 'next/link'
import { Briefcase, ExternalLink } from 'lucide-react'
import { moveDiscovery } from '@/app/(authed)/discoveries/actions'
import { PlaceLabel } from '@/components/regions/place-label'
import { Board, type BoardColumnDef, type BoardQuickAction } from '@/components/board/board'
import { Badge } from '@/components/ui/badge'
import { workModeLabel } from '@/lib/ui/labels'
import { MatchBadge } from '@/components/discovery/match-badge'
import type { CompanyGrowthView } from '@/components/discovery/match-why'
import type { MatchDetail } from '@/lib/discovery/match/types'
import type { BestCv } from '@/lib/cv-fit/types'
import { BestCvLine } from '@/components/cv-fit/best-cv-line'
import type { ScreeningPath } from '@/lib/screening/types'
import { ChipLine } from '@/components/discovery/chip-line'

export type DiscoveryBoardColumn = 'new' | 'shortlisted' | 'saved' | 'dismissed'

export interface DiscoveryBoardItem {
  id: string
  version: string
  status: DiscoveryBoardColumn
  title: string
  companyName: string
  location: string | null
  remoteType: string | null
  /** AI score (optional). */
  matchScore: number | null
  /** Deterministic Match Score and its explanation. */
  fitScore: number | null
  fitDetail: MatchDetail | null
  /** Best CV for this posting (lib/cv-fit); shown in "Why this score". */
  bestCv?: BestCv | null
  applyUrl: string | null
  savedApplicationId: string | null
  /** The employer's growth (Discovery › Companies), shown in "Why this score". */
  growth?: CompanyGrowthView | null
  /** Screening path (lib/screening, compact), computed on read. */
  screen?: ScreeningPath | null
  /** Soft-rule notes from the relevance gate: the card's reason chip. */
  notes?: { penalties?: string[]; boosts?: string[]; infos?: string[] } | null
  /** In the relevance gate's "Needs a look" group (lib/ui/needs-look.ts seam). */
  needsLook?: boolean
}

export const DISCOVERY_BOARD_COLUMNS: readonly BoardColumnDef<DiscoveryBoardColumn>[] = [
  { id: 'new', title: 'New', tone: 'info', emptyText: 'Inbox zero', hint: 'Fresh from your sources', wide: true },
  {
    id: 'shortlisted',
    title: 'Shortlisted',
    tone: 'interview',
    hint: 'Worth a closer look before applying',
    emptyText: 'Shortlist promising roles here',
  },
  {
    // The `saved` status: moving a card here creates a Saved application in
    // the pipeline, not an applied one, so the column says "In pipeline".
    id: 'saved',
    title: 'In pipeline',
    tone: 'applied',
    hint: 'Saved to your applications pipeline (not applied yet)',
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

function renderCard(d: DiscoveryBoardItem): React.ReactNode {
  const mode = workModeLabel(d.remoteType)
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Role first, company as meta: the same order as the list rows. */}
          <div className="line-clamp-2 text-[13px] font-medium leading-snug">{d.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {d.companyName}
            {d.location ? (
              <>
                {' · '}
                <PlaceLabel location={d.location} />
              </>
            ) : null}
          </div>
        </div>
        {/* A card with an application link renders inside <a>: no nested button there. */}
        <MatchBadge
          match={d.fitScore}
          ai={d.matchScore}
          detail={d.fitDetail}
          growth={d.growth ?? null}
          screen={d.screen ?? null}
          interactive={!d.savedApplicationId}
          className="shrink-0"
          extra={d.bestCv ? <BestCvLine className="border-t pt-2" bestCv={d.bestCv} target={{ kind: 'discovery', id: d.id }} /> : undefined}
        />
      </div>
      {mode || d.status !== 'saved' || d.screen ? (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 empty:hidden">
          {/* Reason first, then the screening stage (components/screening), never the same thing twice. */}
          <ChipLine
            compact
            reason={
              d.status === 'saved'
                ? null
                : { status: d.status, notes: d.notes ?? null, ceiling: d.fitDetail?.ceiling ?? null, needsLook: d.needsLook ?? false }
            }
            screen={d.screen ?? null}
          />
          {mode ? (
            <Badge variant="outline" className="text-[10px]">
              {mode}
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
      collapseEmpty
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
