'use client'
import { createContext, Suspense, use, type ReactNode } from 'react'
import { formatDateTime, relativeFromNow, type DateTimeFormat } from '@/lib/ui/date'

/**
 * The user's timezone for every rendered time. The authed layout starts the
 * profile lookup and hands the unresolved promise down (like the nav badges),
 * so the shell never waits on it; each <LocalTime> resolves it in its own tiny
 * Suspense boundary.
 */
const TimeZoneContext = createContext<Promise<string> | null>(null)

interface TimeZoneProviderProps {
  timeZone: Promise<string>
  children: ReactNode
}

export function TimeZoneProvider({ timeZone, children }: TimeZoneProviderProps) {
  return <TimeZoneContext value={timeZone}>{children}</TimeZoneContext>
}

/**
 * The user's IANA timezone, or undefined outside the provider (then the
 * runtime zone applies). Suspends until the profile lookup resolves, so call
 * it below a Suspense boundary, or use <LocalTime>, which brings its own.
 */
export function useTimeZone(): string | undefined {
  const promise = use(TimeZoneContext)
  return promise ? use(promise) : undefined
}

type LocalTimeFormat = DateTimeFormat | 'relative'

interface LocalTimeProps {
  date: Date | string
  /** Visible text. 'relative' shows "2h ago" with the full time as the title. */
  format?: LocalTimeFormat
  /** Hover title; defaults to the full date and time for 'relative'. */
  titleFormat?: DateTimeFormat
  className?: string
}

function LocalTimeInner({ date, format = 'datetime', titleFormat, className }: LocalTimeProps) {
  const timeZone = useTimeZone()
  const iso = typeof date === 'string' ? date : date.toISOString()
  const text = format === 'relative' ? relativeFromNow(date) : formatDateTime(date, format, timeZone)
  const titleAs = titleFormat ?? (format === 'relative' ? 'datetime-year' : undefined)
  return (
    <time
      dateTime={iso}
      title={titleAs ? formatDateTime(date, titleAs, timeZone) : undefined}
      className={className}
      // Relative text depends on "now", which differs between server and browser.
      suppressHydrationWarning
    >
      {text}
    </time>
  )
}

/**
 * A time in the user's timezone, US style ("Sep 27, 2:30 PM"). Usable from
 * server and client components alike.
 */
export function LocalTime(props: LocalTimeProps) {
  return (
    <Suspense fallback={<span className={props.className} aria-hidden="true">&nbsp;</span>}>
      <LocalTimeInner {...props} />
    </Suspense>
  )
}
