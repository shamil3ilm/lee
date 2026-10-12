import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { invites, users } from '@/lib/db/schema'
import {
  acceptInvite,
  createInvite,
  inviteeSeatsUsed,
  listInvites,
  normalizeEmail,
  revokeInvite,
  signInDecision,
} from '@/lib/tenancy/invites'
import { clearAccessCache, isAccessValid, isSessionActive, loadUserAccess, setUserStatus } from '@/lib/tenancy/access'
import { BETA_INVITEE_CAP, INVITE_TTL_DAYS } from '@/lib/tenancy/limits'
import { makeOwner, makeUser } from '@/tests/factories'

/**
 * Invite-only beta gate (spec §2): invites, the 100-invitee cap, the
 * sign-in decision, revocation and session versions.
 */

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const NOW = new Date('2026-10-12T10:00:00Z')
const DAY = 86_400_000

beforeEach(() => {
  sessionMock.mockReset()
  clearAccessCache()
})

describe('createInvite', () => {
  it('normalises the email and expires after 30 days', async () => {
    const owner = await makeOwner({ gmail: false })
    const r = await createInvite(owner.id, '  Friend@Example.COM ', 'college friend', NOW)
    expect(r).toMatchObject({ ok: true, email: 'friend@example.com' })
    if (!r.ok) return
    expect(r.expiresAt.getTime() - NOW.getTime()).toBe(INVITE_TTL_DAYS * DAY)
    expect((await listInvites(NOW)).map((i) => [i.email, i.status, i.note])).toEqual([['friend@example.com', 'pending', 'college friend']])
  })

  it('refuses bad emails, the owner, existing accounts and duplicates', async () => {
    const owner = await makeOwner({ gmail: false })
    const member = await makeUser('member@example.com')
    expect(normalizeEmail(' A@B.co ')).toBe('a@b.co')
    expect(normalizeEmail('nope')).toBeNull()
    expect(await createInvite(owner.id, 'not-an-email', null, NOW)).toEqual({ ok: false, reason: 'invalid_email' })
    expect(await createInvite(owner.id, owner.email, null, NOW)).toEqual({ ok: false, reason: 'owner' })
    expect(await createInvite(owner.id, member.email, null, NOW)).toEqual({ ok: false, reason: 'has_access' })
    expect((await createInvite(owner.id, 'a@example.com', null, NOW)).ok).toBe(true)
    expect(await createInvite(owner.id, 'A@example.com', null, NOW)).toEqual({ ok: false, reason: 'already_invited' })
  })

  it('an expired pending invite can be re-sent', async () => {
    const owner = await makeOwner({ gmail: false })
    expect((await createInvite(owner.id, 'late@example.com', null, NOW)).ok).toBe(true)
    const later = new Date(NOW.getTime() + (INVITE_TTL_DAYS + 1) * DAY)
    expect((await createInvite(owner.id, 'late@example.com', null, later)).ok).toBe(true)
    const rows = await db.select().from(invites).where(eq(invites.email, 'late@example.com'))
    expect(rows.map((r) => r.status).sort()).toEqual(['pending', 'revoked'])
  })

  it(`stops at ${BETA_INVITEE_CAP} invitees (accounts + live invites), owner excluded`, async () => {
    const owner = await makeOwner({ gmail: false })
    // 60 member accounts + 39 live invites = 99 seats.
    await db.insert(users).values(Array.from({ length: 60 }, (_, i) => ({ email: `m${i}@example.com` })))
    await db.insert(invites).values(
      Array.from({ length: 39 }, (_, i) => ({ email: `p${i}@example.com`, expiresAt: new Date(NOW.getTime() + DAY) })),
    )
    // Expired and revoked invites and suspended accounts hold no seat.
    await db.insert(invites).values([
      { email: 'old@example.com', expiresAt: new Date(NOW.getTime() - DAY) },
      { email: 'gone@example.com', status: 'revoked', expiresAt: new Date(NOW.getTime() + DAY) },
    ])
    await db.insert(users).values({ email: 'sus@example.com', status: 'suspended' })
    expect(await inviteeSeatsUsed(db, NOW)).toBe(99)
    expect((await createInvite(owner.id, 'last@example.com', null, NOW)).ok).toBe(true)
    expect(await createInvite(owner.id, 'one-too-many@example.com', null, NOW)).toEqual({ ok: false, reason: 'cap_reached' })
  })
})

describe('signInDecision', () => {
  it('admits the owner, active accounts and live invites; refuses everyone else', async () => {
    const owner = await makeOwner({ gmail: false })
    await makeUser('member@example.com')
    await db.insert(users).values({ email: 'sus@example.com', status: 'suspended' })
    await createInvite(owner.id, 'invited@example.com', null, NOW)

    expect(await signInDecision(owner.email, true, db, NOW)).toEqual({ allow: true, via: 'owner' })
    expect(await signInDecision('MEMBER@example.com', true, db, NOW)).toEqual({ allow: true, via: 'existing' })
    expect(await signInDecision('invited@example.com', true, db, NOW)).toEqual({ allow: true, via: 'invite' })
    expect(await signInDecision('sus@example.com', true, db, NOW)).toEqual({ allow: false, reason: 'suspended' })
    expect(await signInDecision('stranger@example.com', true, db, NOW)).toEqual({ allow: false, reason: 'not_invited' })
    // Google must have verified the email, even for the owner.
    expect(await signInDecision(owner.email, false, db, NOW)).toEqual({ allow: false, reason: 'unverified' })
    expect(await signInDecision(null, true, db, NOW)).toEqual({ allow: false, reason: 'unverified' })
    // An expired invite no longer admits.
    expect(await signInDecision('invited@example.com', true, db, new Date(NOW.getTime() + 31 * DAY))).toEqual({
      allow: false,
      reason: 'not_invited',
    })
  })

  it('the Auth.js signIn callback refuses a non-invited Google account (no user row is created)', async () => {
    const { authConfig } = await import('@/lib/auth/config')
    await makeOwner({ gmail: false })
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(users)
    const signIn = authConfig.callbacks.signIn as (p: unknown) => Promise<boolean>
    const google = { provider: 'google', type: 'oidc', providerAccountId: 'x' }
    expect(
      await signIn({ user: { email: 'stranger@example.com' }, account: google, profile: { email: 'stranger@example.com', email_verified: true } }),
    ).toBe(false)
    expect(
      await signIn({ user: { email: process.env.ALLOWED_EMAIL }, account: google, profile: { email: process.env.ALLOWED_EMAIL, email_verified: false } }),
    ).toBe(false)
    expect(
      await signIn({ user: { email: process.env.ALLOWED_EMAIL }, account: google, profile: { email: process.env.ALLOWED_EMAIL, email_verified: true } }),
    ).toBe(true)
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(users)
    expect(after).toEqual(before)
  })

  it('accepting uses the invite up', async () => {
    const owner = await makeOwner({ gmail: false })
    await createInvite(owner.id, 'new@example.com', null, NOW)
    const u = await makeUser('new@example.com')
    expect(await acceptInvite('New@example.com', u.id, NOW)).toBe(true)
    const [row] = await db.select().from(invites).where(eq(invites.email, 'new@example.com'))
    expect(row).toMatchObject({ status: 'accepted', acceptedUserId: u.id })
    expect(await acceptInvite('new@example.com', u.id, NOW)).toBe(false)
  })
})

describe('revocation and sessions', () => {
  it('revoking an accepted invite suspends the account and invalidates its session', async () => {
    const owner = await makeOwner({ gmail: false })
    const inv = await createInvite(owner.id, 'gone@example.com', null, NOW)
    if (!inv.ok) throw new Error('invite failed')
    const u = await makeUser('gone@example.com')
    await acceptInvite(u.email, u.id, NOW)
    expect(await isSessionActive(u.id, 0)).toBe(true)

    expect(await revokeInvite(inv.id, NOW)).toEqual({ ok: true, suspendedUser: true })
    expect(await isSessionActive(u.id, 0)).toBe(false)
    expect(await signInDecision(u.email, true, db, NOW)).toEqual({ allow: false, reason: 'suspended' })
    expect(await revokeInvite(inv.id, NOW)).toEqual({ ok: false, reason: 'already_revoked' })
  })

  it('reactivating bumps the version again: the old token stays invalid, a new sign-in works', async () => {
    const u = await makeUser()
    expect(await setUserStatus(u.id, 'suspended')).toBe(true)
    expect(await setUserStatus(u.id, 'active')).toBe(true)
    const access = await loadUserAccess(u.id)
    expect(access).toEqual({ status: 'active', sessionVersion: 2 })
    expect(isAccessValid(access, 0)).toBe(false)
    expect(isAccessValid(access, undefined)).toBe(false)
    expect(isAccessValid(access, 2)).toBe(true)
  })

  it('a token without a version matches version 0 (sessions from before this change)', () => {
    expect(isAccessValid({ status: 'active', sessionVersion: 0 }, undefined)).toBe(true)
    expect(isAccessValid(null, 0)).toBe(false)
  })

  it('the Auth.js session callback drops the user of a suspended account', async () => {
    const { authConfig } = await import('@/lib/auth/config')
    const u = await makeUser()
    const session = authConfig.callbacks.session as (p: unknown) => Promise<{ user?: { id?: string } }>
    const base = { user: { email: u.email }, expires: new Date(NOW.getTime() + DAY).toISOString() }
    expect((await session({ session: base, token: { id: u.id, sv: 0 } })).user?.id).toBe(u.id)
    await setUserStatus(u.id, 'suspended')
    expect((await session({ session: { ...base, user: { email: u.email } }, token: { id: u.id, sv: 1 } })).user).toBeUndefined()
  })
})

describe('owner-only invite actions', () => {
  it('a member cannot invite, revoke or suspend', async () => {
    const owner = await makeOwner({ gmail: false })
    const member = await makeUser()
    const inv = await createInvite(owner.id, 'x@example.com', null, NOW)
    if (!inv.ok) throw new Error('invite failed')
    const actions = await import('@/app/(authed)/settings/invites/actions')
    sessionMock.mockResolvedValue(member.id)
    expect(await actions.createInviteAction({ email: 'y@example.com' })).toEqual({ error: 'Only the owner can do that.' })
    expect(await actions.revokeInviteAction(inv.id)).toEqual({ error: 'Only the owner can do that.' })
    expect(await actions.setMemberStatusAction(owner.id, 'suspended')).toEqual({ error: 'Only the owner can do that.' })
    expect((await listInvites(NOW)).map((i) => i.email)).toEqual(['x@example.com'])

    sessionMock.mockResolvedValue(owner.id)
    expect(await actions.createInviteAction({ email: 'y@example.com' })).toMatchObject({ success: true })
    expect(await actions.setMemberStatusAction(owner.id, 'suspended')).toEqual({ error: 'The owner account cannot be suspended.' })
    expect(await actions.setMemberStatusAction(member.id, 'suspended')).toMatchObject({ success: true })
    expect(await isSessionActive(member.id, 0)).toBe(false)
  })
})
