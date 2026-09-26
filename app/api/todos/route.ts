import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as todosQ from '@/lib/db/queries/todos'
import { TODO_STATUSES } from '@/lib/todos/status'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Common shape: dueAt/completedAt accepted as ISO strings, converted to Date
// before insert. Empty string treated as null so form-based clients can
// blank a field without sending `null` explicitly.
const isoDateOrNull = z
  .union([z.string().datetime({ offset: true }), z.literal(''), z.null()])
  .optional()
  .transform((v) => {
    if (!v) return null
    return new Date(v)
  })

const createSchema = z.object({
  title: z.string().min(1, 'title required').max(300),
  notesMd: z.string().max(10_000).optional().nullable(),
  status: z.enum(TODO_STATUSES).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  dueAt: isoDateOrNull,
  applicationId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).max(20).optional(),
})

/**
 * GET /api/todos
 * Optional query: status, applicationId, dueWithin (hours), tag, sort.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const applicationId = url.searchParams.get('applicationId')
    const dueWithin = url.searchParams.get('dueWithin')
    const tag = url.searchParams.get('tag')
    const sort = url.searchParams.get('sort')

    if (status && !todosQ.isTodoStatus(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }
    const opts: todosQ.ListTodosOpts = {}
    if (status && todosQ.isTodoStatus(status)) opts.status = status
    if (applicationId) opts.applicationId = applicationId
    if (dueWithin) {
      // Accept "24h", "48h", or raw hours. Cap at 30 days to bound the query.
      const match = /^(\d+)\s*h?$/i.exec(dueWithin.trim())
      const hours = match ? Number(match[1]) : NaN
      if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) {
        return NextResponse.json(
          { error: 'dueWithin must be 1..720 hours (e.g. 24 or 24h)' },
          { status: 400 },
        )
      }
      opts.dueWithin = { hours }
    }
    if (tag) opts.tag = tag
    if (sort === 'due' || sort === 'priority' || sort === 'created') opts.sort = sort

    const todos = await todosQ.list(userId, opts)
    return NextResponse.json({ todos })
  } catch (err) {
    logger.error('GET /api/todos failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not load todos.' }, { status: 500 })
  }
}

/**
 * POST /api/todos — create a single todo.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const d = parsed.data
    if (!(await todosQ.linksOwnedBy(userId, d))) {
      return NextResponse.json({ error: 'Linked item not found.' }, { status: 404 })
    }
    const row = await todosQ.create(userId, {
      title: d.title,
      notesMd: d.notesMd ?? null,
      status: d.status ?? 'open',
      priority: d.priority ?? 0,
      dueAt: d.dueAt,
      applicationId: d.applicationId ?? null,
      stageId: d.stageId ?? null,
      contactId: d.contactId ?? null,
      companyId: d.companyId ?? null,
      tags: d.tags ?? [],
    })
    return NextResponse.json({ todo: row }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/todos failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not create todo.' }, { status: 500 })
  }
}
