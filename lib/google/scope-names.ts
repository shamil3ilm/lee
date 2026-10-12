/**
 * Google OAuth scope names (pure, no imports): safe for the adapter-free
 * auth config used by proxy.ts. See lib/google/scopes.ts.
 */

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** Everyone, at sign-in: identity plus Drive's per-file (non-sensitive) scope. */
export const BASE_SCOPES = ['openid', 'email', 'profile', DRIVE_FILE_SCOPE] as const

/** Owner only (Phase 1): Gmail sync / alert ingestion, sending, Calendar. */
export const OWNER_SCOPES = [...BASE_SCOPES, GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE, CALENDAR_EVENTS_SCOPE] as const
