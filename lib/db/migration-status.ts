import { sql } from 'drizzle-orm'
import journal from './migrations/meta/_journal.json'
import type { Db } from './client'

/** Number of migrations this build ships (from drizzle's journal). */
export function expectedMigrationCount(): number {
  return journal.entries.length
}

/**
 * Number of migrations recorded as applied in drizzle's tracking table
 * (`drizzle.__drizzle_migrations`, written by the postgres-js migrator).
 * Returns null when the table does not exist — e.g. PGlite test databases,
 * which apply migration SQL directly without tracking.
 */
export async function appliedMigrationCount(db: Db): Promise<number | null> {
  try {
    const result = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{
      n: number
    }>
    return rows[0]?.n ?? null
  } catch {
    return null
  }
}
