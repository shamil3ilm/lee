import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import { DRIVE_FILE_SCOPE } from '@/lib/drive/scope'
import { makeUser } from '@/tests/factories'

/** A user whose Google account granted drive.file; access token = `tok-<id>`. */
export async function driveUser(opts: { scope?: string; expired?: boolean } = {}) {
  const u = await makeUser()
  await db.insert(s.accounts).values({
    userId: u.id,
    type: 'oauth',
    provider: 'google',
    providerAccountId: `g-${u.id}`,
    access_token: `tok-${u.id}`,
    refresh_token: 'refresh',
    expires_at: Math.floor(Date.now() / 1000) + (opts.expired ? -10 : 3600),
    token_type: 'Bearer',
    scope: opts.scope ?? `openid email https://www.googleapis.com/auth/gmail.readonly ${DRIVE_FILE_SCOPE}`,
  })
  return u
}

