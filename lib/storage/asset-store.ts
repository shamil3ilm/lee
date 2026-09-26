import { getDriveConnection, usesDrive, type DriveConnection } from '@/lib/drive/connection'
import { DriveAssetStore } from './drive-asset-store'
import { PostgresAssetStore } from './postgres-asset-store'
import { RoutingAssetStore } from './routing-asset-store'
import type { AssetStore } from './types'

/**
 * Byte storage for user files (LaTeX document assets) and derived blobs (the
 * compiled-PDF cache), behind one interface so routes never care where the
 * bytes live. Backends:
 *   - `drive`: the user's own Google Drive (A2; default once connected)
 *   - `postgres`: `bytea` in Neon, capped at ASSET_QUOTA_BYTES per user
 *
 * Refs are opaque, backend-prefixed strings. Every call is scoped by userId,
 * so a leaked or guessed ref can never read another user's bytes.
 */

export * from './types'

let postgresStore: PostgresAssetStore | null = null
let driveStore: DriveAssetStore | null = null

/** The Postgres store (the fallback backend, and the only one without a user). */
export function getAssetStore(): AssetStore {
  postgresStore ??= new PostgresAssetStore()
  return postgresStore
}

export function getDriveAssetStore(): DriveAssetStore {
  driveStore ??= new DriveAssetStore()
  return driveStore
}

/**
 * The store for one user: writes go to Drive when it is connected and
 * enabled in Settings › Integrations, otherwise to Postgres; reads follow
 * each ref's backend. Pass `connection` when the caller already loaded it.
 */
export async function getAssetStoreForUser(
  userId: string,
  connection?: DriveConnection,
): Promise<AssetStore> {
  const conn = connection ?? (await getDriveConnection(userId))
  const pg = getAssetStore()
  const drive = getDriveAssetStore()
  return new RoutingAssetStore(usesDrive(conn) ? drive : pg, pg, drive, (u, fileId) =>
    drive.client(u).trash(fileId),
  )
}
