/**
 * v12.0 — shared helpers for the /api/cv-score route handlers.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getAIProviderForUser } from '@/lib/ai'
import type { AIProvider } from '@/lib/ai/types'
import { AISkippedError } from '@/lib/ai/signal'
import { logger } from '@/lib/logger'
import { CvScoreError } from './errors'

export const idSchema = z.guid()

/** Session user id, or null when signed out. */
export async function sessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
}

export function badRequest(message = 'Invalid request.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * The user's AI provider, or null when none is configured. Scoring still
 * works without AI — the requirement-fit dimension is simply skipped.
 */
export async function aiForUser(userId: string): Promise<AIProvider | null> {
  try {
    return await getAIProviderForUser(userId)
  } catch (err) {
    logger.warn('cv_score_ai_unavailable', { err: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Map any error to a safe JSON response (never leaks internals). */
export function errorResponse(err: unknown, event: string, fallback: string): NextResponse {
  if (err instanceof CvScoreError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  }
  if (err instanceof AISkippedError) {
    return NextResponse.json(
      { skipped: true, code: err.code, message: err.message, fixHint: err.fixHint },
      { status: 200 },
    )
  }
  logger.error(event, {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null)
}
