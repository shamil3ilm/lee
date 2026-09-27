'use client'
import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE_COOKIE, PAGE_SIZES } from '@/lib/discovery/pager'

const ONE_YEAR_S = 60 * 60 * 24 * 365

/** Rows per page; the choice is remembered in a cookie the page reads. */
export function PageSizeSelect({ size }: { size: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()

  const change = (value: string): void => {
    document.cookie = `${PAGE_SIZE_COOKIE}=${value}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`
    const next = new URLSearchParams(params.toString())
    next.delete('page')
    next.set('size', value)
    start(() => router.push(`${pathname}?${next.toString()}`))
  }

  return (
    <label className="ml-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-pending={pending || undefined}>
      <span className="sr-only sm:not-sr-only">Per page</span>
      <select
        value={size}
        onChange={(e) => change(e.target.value)}
        aria-label="Rows per page"
        className="h-8 rounded-md border border-input bg-card px-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  )
}
