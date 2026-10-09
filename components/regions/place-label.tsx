import { locationDisplay } from '@/lib/regions/display'
import { cn } from '@/lib/utils'

interface PlaceLabelProps {
  location: string | null | undefined
  className?: string
}

/**
 * The most specific label for a posting's location ("Kochi, Kerala ·
 * Infopark", "Dubai, UAE · DIFC", "+1" for more places), with the region
 * chain in the hover title and the text as written kept for screen readers
 * when it differs. Falls back to the location as written.
 */
export function PlaceLabel({ location, className }: PlaceLabelProps) {
  const d = locationDisplay(location)
  if (!d) return null
  const label = d.more > 0 ? `${d.label} +${d.more}` : d.label
  const title = d.chain ? `${location}\n${d.chain}` : undefined
  return (
    <span className={cn(className)} title={title} data-testid="place-label">
      {label}
    </span>
  )
}

/** Plain-text form for meta lines joined with " · ". */
export function placeText(location: string | null | undefined): string | null {
  const d = locationDisplay(location)
  if (!d) return null
  return d.more > 0 ? `${d.label} +${d.more}` : d.label
}
