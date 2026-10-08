import { RecheckProgress } from '@/components/search-prefs/recheck-progress'

/**
 * Discovery notice while saved preferences are still being applied to the
 * inbox in the background: "Re-checking 734 jobs… 412 filtered out".
 */
export function RecheckNotice({ remaining, filtered }: { remaining: number; filtered: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2" data-testid="recheck-notice">
      <RecheckProgress start={{ total: remaining, filtered, pending: true }} />
    </div>
  )
}
