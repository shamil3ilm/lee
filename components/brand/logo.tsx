import { cn } from '@/lib/utils'
import { APP_NAME, BRAND_COLORS } from '@/lib/brand'

interface LogoMarkProps {
  /** Rendered width and height in px. */
  size?: number
  className?: string
  /** Accessible name; omit when a visible wordmark sits next to the mark. */
  title?: string
}

/**
 * The "supported person" mark — a head resting in an open arc on a navy tile.
 * Same geometry as app/icon.svg so the favicon, app icon and in-app logo match.
 * Server-safe (no client hooks), so it renders in layouts, pages and emails.
 */
export function LogoMark({ size = 28, className, title }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect width="1024" height="1024" rx="228" fill={BRAND_COLORS.tile} />
      <path
        d="M284 478 A228 228 0 0 0 740 478"
        fill="none"
        stroke={BRAND_COLORS.glyph}
        strokeWidth="84"
        strokeLinecap="round"
      />
      <circle cx="512" cy="398" r="100" fill={BRAND_COLORS.glyph} />
    </svg>
  )
}

interface LogoProps {
  size?: number
  className?: string
  /** Hide the wordmark (e.g. collapsed sidebar rail). */
  markOnly?: boolean
  wordmarkClassName?: string
}

/** Mark + lowercase wordmark. The wordmark follows the text colour, so it
 * works in light and dark themes; the mark keeps its own tile colours. */
export function Logo({ size = 28, className, markOnly = false, wordmarkClassName }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} title={markOnly ? APP_NAME : undefined} />
      {markOnly ? null : (
        <span className={cn('font-semibold lowercase tracking-tight', wordmarkClassName)}>{APP_NAME}</span>
      )}
    </span>
  )
}
