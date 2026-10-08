import type { UserProfile } from '@/lib/db/queries/profile'
import { defaultsBannerFamilies, lookingForView } from '@/lib/discovery/relevance/view'
import { domainFilterReview } from '@/lib/discovery/relevance/review'
import { relevanceProgress } from '@/lib/discovery/relevance/service'
import { logger } from '@/lib/logger'
import { DefaultsBanner } from '@/components/discovery/defaults-banner'
import { FilterReview } from '@/components/discovery/filter-review'
import { LookingForCard } from '@/components/discovery/looking-for-card'
import { RecheckNotice } from '@/components/discovery/recheck-notice'
import type { PageNoticeItem } from '@/components/discovery/notice-area'

interface NoticeInput {
  userId: string
  profile: UserProfile | null
  /** The "Filtered out" list is open. */
  filteredTab: boolean
  /** Preferences changed since the inbox was last gated (read before catch-up). */
  stale: boolean
  suggestions: { count: number; sparse: boolean } | null
  /** Where Settings links come back to. */
  from: string
}

/**
 * Discovery's notices, highest priority first; the page shows one and
 * folds the rest behind "+N more" (audit S1):
 *   1. "Did we filter something useful?" (on the Filtered out list)
 *   2. a background re-check still applying saved preferences
 *   3. filtering on defaults (preferences unsaved): confirm or set them
 *   4. the one-line "What you're looking for" summary
 */
export async function discoveryNotices(input: NoticeInput): Promise<PageNoticeItem[]> {
  const { userId, profile, filteredTab, stale, suggestions, from } = input
  const notices: PageNoticeItem[] = []

  if (filteredTab) {
    const review = (await domainFilterReview(userId)).map(({ key, title, domain, count }) => ({ key, title, domain, count }))
    if (review.length > 0) notices.push({ id: 'filter-review', node: <FilterReview items={review} /> })
  }

  if (stale) {
    const progress = await relevanceProgress(userId).catch((err: unknown) => {
      logger.warn('discovery.recheck_progress_failed', { err: err instanceof Error ? err.message : String(err) })
      return null
    })
    if (progress && progress.remaining > 0) {
      notices.push({ id: 'recheck', node: <RecheckNotice remaining={progress.remaining} filtered={progress.filtered} /> })
    }
  }

  const families = defaultsBannerFamilies(profile)
  if (families) {
    notices.push({
      id: 'defaults',
      node: <DefaultsBanner families={families} sparse={suggestions?.sparse ?? false} from={from} />,
    })
  } else if (suggestions) {
    notices.push({
      id: 'looking-for',
      node: <LookingForCard view={lookingForView(profile)} suggestionCount={suggestions.count} from={from} />,
    })
  }
  return notices
}
