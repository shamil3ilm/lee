import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { auth } from '@/lib/auth'

/** v14 — tiny helpers shared by the /api/lab/* route handlers. */

export async function sessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
}

export function badRequest(message: string, issues?: unknown): NextResponse {
  return NextResponse.json(issues ? { error: message, issues } : { error: message }, {
    status: 400,
  })
}

export function notFound(message = 'Not found.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function serverError(message = 'Something went wrong.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 })
}

/** Parse + validate a JSON body. Returns the data or a ready 400 response. */
export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, response: badRequest('Invalid JSON body.') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return { ok: false, response: badRequest(issues[0]?.message ?? 'Invalid request.', issues) }
  }
  return { ok: true, data: parsed.data }
}
