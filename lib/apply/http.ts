import { NextResponse } from 'next/server'
import { AISkippedError } from '@/lib/ai/signal'
import { ApplicationNotFoundError, MasterCVNotFoundError } from '@/lib/documents/errors'
import { logger } from '@/lib/logger'
import { PrepareError } from './prepare'

/**
 * Error → response for the Prepare AI steps. A signal-gating refusal is a
 * handled skip (200 + fix hint; the step stays open); known errors carry
 * their own message; anything else is logged and gets a generic message.
 */
export function prepareStepError(err: unknown, what: string, fallback: string, usage: unknown): NextResponse {
  if (err instanceof AISkippedError) {
    return NextResponse.json({ skipped: true, code: err.code, message: err.message, fixHint: err.fixHint, usage })
  }
  if (err instanceof MasterCVNotFoundError) return NextResponse.json({ error: err.message }, { status: 400 })
  if (err instanceof ApplicationNotFoundError) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  if (err instanceof PrepareError) {
    return NextResponse.json({ error: err.message }, { status: err.code === 'not_found' ? 404 : 400 })
  }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return NextResponse.json({ error: fallback }, { status: 500 })
}
