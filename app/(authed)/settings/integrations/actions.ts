'use server'

/**
 * Integrations settings server actions.
 *
 * Reconnect is currently a pure client-side redirect
 * (`/api/auth/signout?callbackUrl=/api/auth/signin/google`) because Auth.js
 * needs the full browser navigation to clear the session cookie and hand off
 * to Google's consent screen. Manual Gmail sync is exposed via
 * `POST /api/gmail/sync`, which the panel calls directly with `fetch`.
 *
 * This file exists as a placeholder so future revocation or scope-inspection
 * actions have a natural home without another round of file-plumbing.
 */

export {}
