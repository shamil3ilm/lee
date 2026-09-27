import * as retentionQ from '@/lib/db/queries/retentionSettings'
import { logger } from '@/lib/logger'
import { ALL_TABLES_LIMIT, databaseSizeBytes, largestTables } from './collect'
import { NEON_STORAGE_LIMIT } from './limits'

/**
 * SERVER-ONLY. Settings › Storage: live per-table sizes (exact on Neon, a
 * catalog estimate on PGlite — see collect.ts), the user's retention
 * windows and the latest cleanup run.
 */

export interface TableSize {
  name: string
  bytes: number
  /** Share of the whole database, 0–1. */
  share: number
}

export interface StoragePageData {
  dbSizeBytes: number | null
  capBytes: number
  tables: TableSize[]
  settings: retentionQ.RetentionSettingsView
}

async function safe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logger.warn('storage_page_read_failed', { what, err: err instanceof Error ? err.message : String(err) })
    return fallback
  }
}

export function withShares(tables: readonly { name: string; bytes: number }[], total: number | null): TableSize[] {
  const sum = total && total > 0 ? total : tables.reduce((n, t) => n + t.bytes, 0)
  return tables.map((t) => ({ ...t, share: sum > 0 ? t.bytes / sum : 0 }))
}

export async function getStoragePageData(userId: string): Promise<StoragePageData> {
  const [dbSizeBytes, tables, settings] = await Promise.all([
    safe('db_size', () => databaseSizeBytes(), null),
    safe('tables', () => largestTables(undefined, undefined, ALL_TABLES_LIMIT), []),
    retentionQ.get(userId),
  ])
  return { dbSizeBytes, capBytes: NEON_STORAGE_LIMIT.value, tables: withShares(tables, dbSizeBytes), settings }
}
