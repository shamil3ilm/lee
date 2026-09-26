import { PostgresAssetStore } from './postgres-asset-store'
import type { AssetStore } from './types'

/**
 * Byte storage for user files (LaTeX document assets) and derived blobs (the
 * compiled-PDF cache), behind one interface so the backend can change without
 * touching routes. Today the only backend is Postgres `bytea`
 * (PostgresAssetStore); an object-storage / Google Drive backend can be added
 * later behind the same contract (lib/storage/types.ts).
 *
 * Refs are opaque, backend-prefixed strings. Every call is scoped by userId,
 * so a leaked or guessed ref can never read another user's bytes.
 */

export * from './types'

let store: AssetStore | null = null

/** The configured store (Postgres until another backend is wired in). */
export function getAssetStore(): AssetStore {
  store ??= new PostgresAssetStore()
  return store
}
