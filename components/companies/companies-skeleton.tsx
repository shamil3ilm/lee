import { Skeleton } from '@/components/ui/skeleton'

/** Loading placeholder for Discovery › Companies, in the shape of the tab (toolbar, segments, rows). */
export function CompaniesSkeleton() {
  return (
    <div className="space-y-3" aria-busy data-testid="companies-skeleton">
      <span className="sr-only" role="status">
        Loading companies…
      </span>
      <Skeleton className="h-4 w-3/4 max-w-xl" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-10 w-full sm:w-[28rem]" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <ul className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex gap-3">
              <Skeleton className="size-9 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-36 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-5 w-12 shrink-0" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
