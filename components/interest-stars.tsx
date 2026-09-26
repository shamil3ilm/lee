'use client'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InterestStarsProps {
  level: number | null | undefined
  className?: string
  size?: 'sm' | 'md'
  /**
   * When provided, stars become clickable. Clicking the same value again
   * clears the rating (level 0).
   */
  onChange?: (next: number) => void
  disabled?: boolean
  ariaLabel?: string
}

export function InterestStars({
  level,
  className,
  size = 'sm',
  onChange,
  disabled,
  ariaLabel,
}: InterestStarsProps) {
  const value = Math.max(0, Math.min(5, level ?? 0))
  const interactive = typeof onChange === 'function'
  if (!interactive && value === 0) return null
  const iconSize = size === 'md' ? 'size-4' : 'size-3'
  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      aria-label={ariaLabel ?? `Interest ${value}/5`}
      role={interactive ? 'radiogroup' : undefined}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < value
        const commonIcon = cn(
          iconSize,
          filled ? 'fill-warning text-warning' : 'text-muted-foreground/40',
        )
        if (!interactive) {
          return <Star key={i} className={commonIcon} />
        }
        const next = i + 1
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={next === value}
            aria-label={`Set interest to ${next}`}
            onClick={() => onChange?.(next === value ? 0 : next)}
            className={cn(
              'rounded transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Star className={commonIcon} />
          </button>
        )
      })}
    </div>
  )
}
