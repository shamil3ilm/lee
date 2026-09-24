import { beforeAll, beforeEach } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db, isPglite, pgliteClient } from '@/lib/db/client'

// App-level tables to truncate between tests. Ordered from child to parent
// (though CASCADE handles the rest). Keep in sync with lib/db/schema.ts.
const TABLES = [
  'documents',
  'activities',
  'processed_gmail_threads',
  'interview_stages',
  'application_contacts',
  'applications',
  'jobs',
  'contacts',
  'companies',
  'user_profile',
  'company_discoveries',
  'discoveries',
  'sources',
  'ai_call_logs',
  'sessions',
  'accounts',
  '"verificationTokens"',
  'users',
]

let migrationsApplied = false

async function applyMigrationsToPglite(): Promise<void> {
  if (!isPglite || !pgliteClient) return
  if (migrationsApplied) return

  // Guard against re-applying when the same PGlite instance is reused
  // across test files (isolate: false shares the module cache).
  const check = await pgliteClient.query<{ exists: boolean }>(
    "select exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'users') as exists",
  )
  if (check.rows[0]?.exists) {
    migrationsApplied = true
    return
  }

  const folder = path.resolve(process.cwd(), 'lib/db/migrations')
  const entries = await readdir(folder)
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort()
  for (const file of sqlFiles) {
    const text = await readFile(path.join(folder, file), 'utf8')
    const statements = text
      .split(/-->\s*statement-breakpoint\s*/g)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      await pgliteClient.exec(stmt)
    }
  }
  migrationsApplied = true
}

beforeAll(async () => {
  // In-memory PGlite starts empty each worker process. Apply schema once.
  await applyMigrationsToPglite()
})

beforeEach(async () => {
  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`))
})
