import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { expectedMigrationCount } from '@/lib/db/migration-status'
import journal from '@/lib/db/migrations/meta/_journal.json'

describe('GET /api/health', () => {
  it('reports db up and the expected migration count from the journal', async () => {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.db).toBe('up')
    expect(body.migrations.expected).toBe(journal.entries.length)
  })

  it('is never cached (uptime probes must see live status)', async () => {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('reports applied migrations from the drizzle tracking table when present', async () => {
    await db.execute(sql`create schema if not exists drizzle`)
    await db.execute(
      sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
    )
    await db.execute(sql`delete from drizzle.__drizzle_migrations`)
    await db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('a', 1), ('b', 2)`)
    try {
      const { GET } = await import('@/app/api/health/route')
      const body = await (await GET()).json()
      expect(body.migrations.applied).toBe(2)
      expect(body.migrations.upToDate).toBe(false)
    } finally {
      await db.execute(sql`drop schema drizzle cascade`)
    }
  })

  it('reports applied as null when no tracking table exists', async () => {
    const { GET } = await import('@/app/api/health/route')
    const body = await (await GET()).json()
    expect(body.migrations.applied).toBeNull()
    expect(body.migrations.upToDate).toBeNull()
  })
})

describe('expectedMigrationCount', () => {
  it('matches the number of journal entries', () => {
    expect(expectedMigrationCount()).toBe(journal.entries.length)
  })
})
