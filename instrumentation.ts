import type { Instrumentation } from 'next'

/**
 * Server start: persist logger warn/error and run events to system_events
 * (lib/logs/sink.ts). Node runtime only, and never during `next build`
 * (prerendering must not write to the database).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  try {
    const { installEventSink } = await import('./lib/logs/sink')
    installEventSink()
  } catch (err) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        event: 'system_events_sink_install_failed',
        err: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

/** Unhandled server errors (render, route, action) — also persisted. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logger } = await import('./lib/logger')
  logger.error('request_error', {
    route: context.routePath,
    method: request.method,
    kind: context.routeType,
    err: err instanceof Error ? err.message : String(err),
    code:
      typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined,
  })
}
