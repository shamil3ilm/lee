/**
 * Placeholder shown while a lazily loaded recharts body downloads. It fills
 * the parent's fixed-height chart region (h-56 in the card shell), so the
 * swap to the real chart causes no layout shift.
 */
export function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-md bg-muted/40" aria-hidden />
}
