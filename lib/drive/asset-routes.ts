import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import { AssetValidationError } from '@/lib/db/queries/documentAssets'
import { logger } from '@/lib/logger'
import { DriveError, driveErrorResponse } from './errors'

/** Shared plumbing for the Drive asset routes (session, ownership, errors). */

export const driveFileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/)

export type RouteContext = { params: Promise<{ id: string }> }

/** Signed-in user id + an owned document id, or an error response. */
export async function ownedDocument(
  ctx: RouteContext,
): Promise<{ userId: string; documentId: string } | NextResponse> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  if (!z.guid().safeParse(id).success) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const doc = await documentsQ.getById(userId, id)
  if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return { userId, documentId: id }
}

/** Typed errors → their own friendly message; anything else → generic. */
export function assetRouteError(err: unknown, event: string, fallback: string): NextResponse {
  if (err instanceof AssetValidationError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
  }
  if (err instanceof DriveError) return driveErrorResponse(err)
  logger.error(event, {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  return NextResponse.json({ error: fallback }, { status: 500 })
}

/**
 * The browser origin to register on a resumable session (so Google returns
 * CORS headers on the browser's PUT). Only a same-origin value is accepted.
 */
export function sameOrigin(req: Request): string | undefined {
  const origin = req.headers.get('origin')
  if (!origin) return undefined
  try {
    return new URL(req.url).origin === origin ? origin : undefined
  } catch {
    return undefined
  }
}
