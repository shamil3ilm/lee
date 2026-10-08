import { z } from 'zod'

/** Largest client error report accepted, in bytes. */
export const MAX_CLIENT_ERROR_BYTES = 2048
/** Reports per user per minute; a render loop must not flood the logs. */
export const CLIENT_ERRORS_PER_MINUTE = 10

/**
 * What an error boundary sends: the digest (server errors; the full error is
 * already logged by instrumentation's onRequestError), or the message of an
 * error thrown in the browser, plus the route it happened on.
 */
export const clientErrorSchema = z.object({
  digest: z.string().max(64).optional(),
  message: z.string().max(500).optional(),
  route: z.string().max(200),
  boundary: z.enum(['app', 'authed', 'global']),
})

export type ClientErrorReport = z.infer<typeof clientErrorSchema>

/** Builds the report body; the message is only sent when there is no digest. */
export function toClientErrorReport(
  error: { message?: string; digest?: string },
  route: string,
  boundary: ClientErrorReport['boundary'],
): ClientErrorReport {
  const digest = error.digest?.slice(0, 64)
  return {
    boundary,
    route: route.slice(0, 200),
    ...(digest ? { digest } : { message: (error.message ?? 'Unknown error').slice(0, 500) }),
  }
}

/** Fire-and-forget POST to /api/client-errors; never throws. */
export function reportClientError(report: ClientErrorReport): void {
  try {
    const body = JSON.stringify(report)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/client-errors', { method: 'POST', body, keepalive: true }).catch(() => undefined)
  } catch {
    // Reporting must never break the error screen itself.
  }
}
