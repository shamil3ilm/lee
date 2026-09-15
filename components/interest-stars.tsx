import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InterestStarsProps {
  level: number | null | undefined
  className?: string
}

export function InterestStars({ level, className }: InterestStarsProps) {
  const value = Math.max(0, Math.min(5, level ?? 0))
  if (value === 0) return null
  return (
    <div className={cn('flex items-center gap-0.5', className)} aria-label={`Interest ${value}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'size-3',
            i < value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
          )}
        />
      ))}
    </div>
  )
}
