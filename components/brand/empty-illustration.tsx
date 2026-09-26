import { cn } from '@/lib/utils'

interface EmptyIllustrationProps {
  /** Rendered width and height in px. */
  size?: number
  className?: string
}

/**
 * Empty-state motif built from the logo's shapes: a soft rounded tile, the
 * open supporting arc and the resting circle, plus a faint dotted "place
 * for what comes next". Pure inline SVG, colours from theme tokens, so it
 * adapts to light and dark and costs no request. Decorative only.
 */
export function EmptyIllustration({ size = 72, className }: EmptyIllustrationProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <rect x="8" y="8" width="80" height="80" rx="18" className="fill-accent" />
      <path
        d="M27 47 A21 21 0 0 0 69 47"
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        className="stroke-primary/70"
      />
      <circle cx="48" cy="39" r="9" className="fill-primary/70" />
      <circle
        cx="48"
        cy="48"
        r="33"
        fill="none"
        strokeWidth="1.5"
        strokeDasharray="1 5"
        strokeLinecap="round"
        className="stroke-primary/35"
      />
    </svg>
  )
}
