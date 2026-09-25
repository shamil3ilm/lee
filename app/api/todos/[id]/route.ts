import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as todosQ from '@/lib/db/queries/todos'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const isoDateOrNull = z
  .union([z.string().datetime({ offset: true }), z.literal(''), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (!v) return null
    return new Date(v)
  })

const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    notesMd: z.string().max(10_000).optional().nullable(),
    status: z.enum(['open', 'done', 'archived']).optional(),
    priority: z.number().int().min(0).max(3).optional(),
    dueAt: isoDateOrNull,
    applicationId: z.string().uuid().optional().nullable(),
    stageId: z.string().uuid().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    companyId: z.string().uuid().optional().nullable(),
    tags: z.array(z.string()).max(20).optional(),
    // Shortcut: `toggle` flips status and updates completedAt in one call.
    toggle: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const { toggle, ...patch } = parsed.data

    if (toggle) {
      const row = await todosQ.toggleStatus(userId, id)
      if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
      return NextResponse.json({ todo: row })
    }

    // If the patch flips status to `done`, also stamp completedAt so the row
    // is consistent whether the caller used the shortcut or a plain PATCH.
    const completedAtPatch =
      patch.status === 'done'
        ? { completedAt: new Date() }
        : patch.status === 'open'
          ? { completedAt: null }
          : {}

    const row = await todosQ.update(userId, id, { ...patch, ...completedAtPatch })
    if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ todo: row })
  } catch (err) {
    logger.error('PATCH /api/todos/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not update todo.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    const existing = await todosQ.getById(userId, id)
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    await todosQ.remove(userId, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('DELETE /api/todos/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not delete todo.' }, { status: 500 })
  }
}
