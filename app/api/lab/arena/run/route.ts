import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { arenaRunInputSchema, runArena, type ArenaEvent } from '@/lib/lab/arena'
import { parseJson, serverError, sessionUserId, unauthorized } from '@/lib/lab/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/lab/arena/run
 * Body: { system?, prompt, jsonSchema?, models: ModelRef[2..6], blind?, temperature?, maxTokens?, stream? }
 *
 * - `stream: false` (default) → JSON `{ run }` once every model has settled.
 * - `stream: true` → `text/event-stream` with `start`, `delta`, `result`,
 *   `done` events (one JSON payload per event), so each model's output
 *   renders as it arrives.
 *
 * Provider failures never fail the run: each result carries its own
 * user-safe `error` (+ `metrics.errorKind`, e.g. `rate_limited`).
 */
export async function POST(req: Request): Promise<Response> {
  const userId = await sessionUserId().catch(() => null)
  if (!userId) return unauthorized()
  const parsed = await parseJson(req, arenaRunInputSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  if (!input.stream) {
    try {
      const run = await runArena(userId, input, { signal: req.signal })
      return NextResponse.json({ run })
    } catch (err) {
      logger.error('arena run failed', { err: err instanceof Error ? err.message : String(err) })
      return serverError('Arena run failed.')
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (e: ArenaEvent | { type: 'error'; error: string }): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
        } catch {
          closed = true // client went away
        }
      }
      try {
        await runArena(userId, input, { onEvent: send, signal: req.signal })
      } catch (err) {
        logger.error('arena stream failed', { err: err instanceof Error ? err.message : String(err) })
        send({ type: 'error', error: 'Arena run failed.' })
      } finally {
        if (!closed) {
          closed = true
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
      }
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
