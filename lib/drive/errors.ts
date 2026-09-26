import { NextResponse } from 'next/server'
import { NoGoogleAccountError, GoogleGrantRevokedError } from '@/lib/google/tokens'
import { isTimeoutError } from '@/lib/net/timeout'

/**
 * Typed Google Drive failures. Every one carries a friendly, user-facing
 * message; Drive's raw error bodies are logged by the caller, never shown.
 */
export type DriveErrorCode =
  | 'not_connected'
  | 'reconnect'
  | 'quota'
  | 'not_found'
  | 'unsupported'
  | 'verify_failed'
  | 'unavailable'

const MESSAGES: Record<DriveErrorCode, string> = {
  not_connected: 'Connect Google Drive to use this.',
  reconnect: 'Reconnect Google Drive: access has expired or was revoked.',
  quota: 'Your Google Drive storage is full. Free up space in Drive and try again.',
  not_found: 'That file is no longer available in Google Drive.',
  unsupported: 'That file type cannot be used here.',
  verify_failed: 'The file could not be verified after upload. Please try again.',
  unavailable: 'Google Drive is not responding right now. Please try again in a moment.',
}

const STATUS: Record<DriveErrorCode, number> = {
  not_connected: 409,
  reconnect: 409,
  quota: 507,
  not_found: 404,
  unsupported: 415,
  verify_failed: 502,
  unavailable: 502,
}

export class DriveError extends Error {
  readonly code: DriveErrorCode
  readonly status: number
  constructor(code: DriveErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? MESSAGES[code], options)
    this.name = 'DriveError'
    this.code = code
    this.status = STATUS[code]
  }

  /** The UI should offer a (re)connect button for these. */
  get needsConnect(): boolean {
    return this.code === 'not_connected' || this.code === 'reconnect'
  }
}

/** Normalise token-layer and network errors into DriveError. */
export function toDriveError(err: unknown): DriveError {
  if (err instanceof DriveError) return err
  if (err instanceof NoGoogleAccountError) return new DriveError('not_connected', undefined, { cause: err })
  if (err instanceof GoogleGrantRevokedError) return new DriveError('reconnect', undefined, { cause: err })
  if (isTimeoutError(err)) return new DriveError('unavailable', undefined, { cause: err })
  return new DriveError('unavailable', undefined, { cause: err })
}

/** JSON error body for route handlers; `connect` tells the UI to offer (re)connect. */
export function driveErrorResponse(err: DriveError): NextResponse {
  return NextResponse.json(
    { error: err.message, code: err.code, connect: err.needsConnect || undefined },
    { status: err.status },
  )
}
