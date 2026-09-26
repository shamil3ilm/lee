import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appliedMigrationCount, expectedMigrationCount } from '@/lib/db/migration-status'

export const dynamic = 'force-dynamic'

// Uptime probes and deploy checks must always see live status, never a
// CDN- or browser-cached copy.
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(): Promise<NextResponse> {
  try {
    await db.execute(sql`select 1`)
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503, headers: NO_STORE })
  }

  // Counts only — no names, hosts or other schema detail on a public route.
  const applied = await appliedMigrationCount(db)
  const expected = expectedMigrationCount()
  return NextResponse.json(
    {
      ok: true,
      db: 'up',
      migrations: { applied, expected, upToDate: applied === null ? null : applied >= expected },
    },
    { headers: NO_STORE },
  )
}
