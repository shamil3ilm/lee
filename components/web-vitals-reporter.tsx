'use client'
import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'
import { browserPageContext, createVitalsQueue, sendBeaconBody } from '@/lib/vitals/client'

type ReportCallback = Parameters<typeof useReportWebVitals>[0]

// One queue per tab. Created lazily so nothing touches `window` during SSR.
let queue: ReturnType<typeof createVitalsQueue> | null = null
function getQueue() {
  queue ??= createVitalsQueue({ context: browserPageContext, send: sendBeaconBody })
  return queue
}

// Stable reference: Next re-reports every metric when the callback changes.
const report: ReportCallback = (metric) => getQueue().add(metric)

/**
 * Sends this page load's LCP, FCP, INP, CLS and TTFB to /api/vitals
 * (Analytics › Performance). Mounted in the authed layout only: the endpoint
 * needs a session. Batches metrics and flushes on a short timer or when the
 * tab is hidden, whichever comes first.
 */
export function WebVitalsReporter() {
  useReportWebVitals(report)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') getQueue().flush()
    }
    const onPageHide = () => getQueue().flush()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])
  return null
}
