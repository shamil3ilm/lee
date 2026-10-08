import { requireUserId } from '@/lib/auth/require-session'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { logger } from '@/lib/logger'
import { loadWatchSuggestions, type WatchSuggestion } from '@/lib/radar/suggest'
import { PageHeader } from '@/components/page-header'
import { WatchlistPanel } from '@/components/radar/watchlist-panel'

export const dynamic = 'force-dynamic'

export default async function RadarWatchlistPage() {
  const userId = await requireUserId()
  const terms = await termsQ.list(userId)
  const suggestions = await loadWatchSuggestions(
    userId,
    terms.map((t) => t.term),
  ).catch((err: unknown): WatchSuggestion[] => {
    logger.warn('radar_suggestions_failed', { err: err instanceof Error ? err.message : String(err) })
    return []
  })
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Watchlist"
        description="Terms and names the Radar watches for. Matches are highlighted, counted in the nav and sent as you choose in Settings › Notifications. Terms are sent to Hacker News, GitHub and GDELT searches."
      />
      <WatchlistPanel
        terms={terms.map((t) => ({ id: t.id, term: t.term, aliases: t.aliases, kind: t.kind === 'entity' ? 'entity' : 'term', muted: t.muted }))}
        suggestions={suggestions}
      />
    </div>
  )
}
