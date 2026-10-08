'use client'
import { useLinkStatus } from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Put inside a next/link <Link>: a fixed-size marker that fades in while
 * that link's navigation is pending (not yet prefetched). It also sets
 * `data-pending`, so the link can style itself with
 * `has-[[data-pending]]:…` (the nav item turns active immediately).
 * Always rendered, positioned absolutely: no layout shift.
 */
export function LinkPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? '' : undefined}
      className={cn('lee-link-hint pointer-events-none absolute rounded-full bg-primary', className)}
    />
  )
}
