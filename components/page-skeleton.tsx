import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type PageSkeletonVariant = 'list' | 'cards' | 'form'

interface PageSkeletonProps {
  variant: PageSkeletonVariant
  className?: string
}

/**
 * Route-level loading placeholder (used by loading.tsx files). Paints with
 * the app shell before any database work, in the rough shape of the page it
 * stands in for: a PageHeader line, then a table (`list`), a card grid
 * (`cards`) or stacked settings sections (`form`).
 */
export function PageSkeleton({ variant, className }: PageSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)} aria-busy>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        {variant === 'form' ? null : <Skeleton className="h-9 w-32 shrink-0" />}
      </div>
      {variant === 'list' ? <ListBody /> : null}
      {variant === 'cards' ? <CardsBody /> : null}
      {variant === 'form' ? <FormBody /> : null}
    </div>
  )
}

function ListBody() {
  return (
    <>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </>
  )
}

function CardsBody() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-72 w-full" />
      ))}
    </div>
  )
}

function FormBody() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
