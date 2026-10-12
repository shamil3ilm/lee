import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, queueJobs } from '@/lib/db/schema'
import { authConfig } from '@/lib/auth/config'
import { BASE_SCOPES, GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE, CALENDAR_EVENTS_SCOPE, mergeScopes } from '@/lib/google/scope-names'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { makeOwner } from '@/tests/factories'

/**
 * After the scope split (sign-in asks only for BASE_SCOPES), the owner's
 * existing Gmail/Calendar grant keeps working without reconnecting: the
 * stored scope never shrinks on sign-in, so the Gmail jobs stay planned.
 */

async function storedScope(userId: string): Promise<Set<string>> {
  const [row] = await db
    .select({ scope: accounts.scope })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
  return new Set((row?.scope ?? '').split(' ').filter(Boolean))
}

describe('owner Gmail/Calendar grant after the scope split', () => {
  it('a base-scope sign-in keeps the stored Gmail and Calendar scopes, and Gmail jobs stay planned', async () => {
    const owner = await makeOwner() // existing account holding the full owner grant
    const signInEvent = authConfig.events.signIn as (m: unknown) => Promise<void>
    // Google's token response on a later sign-in that requested only BASE_SCOPES.
    await signInEvent({
      user: { id: owner.id, email: owner.email },
      account: { provider: 'google', type: 'oidc', providerAccountId: 'x', access_token: 'new-at', scope: BASE_SCOPES.join(' ') },
    })
    const scopes = await storedScope(owner.id)
    for (const s of [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE, CALENDAR_EVENTS_SCOPE, ...BASE_SCOPES]) expect(scopes.has(s), s).toBe(true)

    const now = new Date()
    await scheduleDailyJobs(now)
    const types = (await db.select({ type: queueJobs.type }).from(queueJobs).where(eq(queueJobs.userId, owner.id))).map((r) => r.type)
    expect(types).toEqual(expect.arrayContaining([JOB_TYPES.gmailSync, JOB_TYPES.digest, JOB_TYPES.discoveryEmail]))
  })

  it('an owner without the Gmail grant gets no Gmail jobs (the Settings › Invites prompt shows)', async () => {
    const owner = await makeOwner({ gmail: false })
    await scheduleDailyJobs(new Date())
    const types = (await db.select({ type: queueJobs.type }).from(queueJobs).where(eq(queueJobs.userId, owner.id))).map((r) => r.type)
    expect(types).not.toContain(JOB_TYPES.gmailSync)
    expect(types).toContain(JOB_TYPES.followups)
  })

  it('mergeScopes is a stable union', () => {
    expect(mergeScopes('openid email a', 'email b')).toBe('openid email a b')
    expect(mergeScopes(null, 'x')).toBe('x')
    expect(mergeScopes('x', undefined)).toBe('x')
  })
})
