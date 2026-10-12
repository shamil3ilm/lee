import { and, desc, eq, gt, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, type DbClient } from '@/lib/db/client'
import { invites, users } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { setUserStatus } from './access'
import { BETA_INVITEE_CAP, INVITE_TTL_DAYS } from './limits'

/**
 * SERVER-ONLY. Invite-only beta (spec §2): the owner (ALLOWED_EMAIL) invites
 * people by email; sign-in admits the owner, active existing users and
 * holders of a live invite, and nobody else. At most BETA_INVITEE_CAP
 * invitees (active non-owner accounts + live pending invites).
 */

const emailSchema = z.string().trim().toLowerCase().email().max(254)

export function normalizeEmail(raw: unknown): string | null {
  const p = emailSchema.safeParse(raw)
  return p.success ? p.data : null
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === env.ALLOWED_EMAIL.trim().toLowerCase()
}

function ownerLower(): string {
  return env.ALLOWED_EMAIL.trim().toLowerCase()
}

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/**
 * Seats in use: active non-owner accounts plus live (pending, unexpired)
 * invites for emails that have no account yet.
 */
export async function inviteeSeatsUsed(client: DbClient = db, now: Date = new Date()): Promise<number> {
  const result = await client.execute(sql`
    select
      (select count(*) from users u
        where u.status = 'active' and lower(u.email) <> ${ownerLower()})
      +
      (select count(*) from invites i
        where i.status = 'pending' and i.expires_at > ${now.toISOString()}::timestamptz
          and not exists (select 1 from users u where lower(u.email) = lower(i.email)))
      as used
  `)
  return Number(toRows<{ used: number | string }>(result)[0]?.used ?? 0)
}

export type CreateInviteResult =
  | { ok: true; id: string; email: string; expiresAt: Date }
  | { ok: false; reason: 'invalid_email' | 'owner' | 'has_access' | 'already_invited' | 'cap_reached' | 'suspended' }

/** Create a pending invite (owner only: the caller checks requireOwner). */
export async function createInvite(
  invitedBy: string,
  rawEmail: string,
  note: string | null = null,
  now: Date = new Date(),
): Promise<CreateInviteResult> {
  const email = normalizeEmail(rawEmail)
  if (!email) return { ok: false, reason: 'invalid_email' }
  if (isOwnerEmail(email)) return { ok: false, reason: 'owner' }
  return db.transaction(async (tx) => {
    // Serialise invite creation so two concurrent invites cannot both take the last seat.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lee:invites'))`)
    const [user] = await tx
      .select({ status: users.status })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1)
    if (user?.status === 'active') return { ok: false, reason: 'has_access' } as const
    if (user?.status === 'suspended') return { ok: false, reason: 'suspended' } as const
    // An expired pending invite frees its email.
    await tx
      .update(invites)
      .set({ status: 'revoked', updatedAt: now })
      .where(and(sql`lower(${invites.email}) = ${email}`, eq(invites.status, 'pending'), sql`${invites.expiresAt} <= ${now.toISOString()}::timestamptz`))
    const [live] = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(and(sql`lower(${invites.email}) = ${email}`, eq(invites.status, 'pending')))
      .limit(1)
    if (live) return { ok: false, reason: 'already_invited' } as const
    if ((await inviteeSeatsUsed(tx, now)) >= BETA_INVITEE_CAP) return { ok: false, reason: 'cap_reached' } as const
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000)
    const [row] = await tx
      .insert(invites)
      .values({ email, invitedBy, note: note?.trim().slice(0, 200) || null, expiresAt, createdAt: now, updatedAt: now })
      .returning()
    return { ok: true, id: row!.id, email, expiresAt } as const
  })
}

export type RevokeResult = { ok: true; suspendedUser: boolean } | { ok: false; reason: 'not_found' | 'already_revoked' }

/**
 * Revoke an invite. A pending invite simply stops admitting its email; an
 * accepted one also suspends that account (and ends its sessions).
 */
export async function revokeInvite(inviteId: string, now: Date = new Date()): Promise<RevokeResult> {
  const [inv] = await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1)
  if (!inv) return { ok: false, reason: 'not_found' }
  if (inv.status === 'revoked') return { ok: false, reason: 'already_revoked' }
  await db.update(invites).set({ status: 'revoked', updatedAt: now }).where(eq(invites.id, inviteId))
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${inv.email.toLowerCase()}`)
    .limit(1)
  if (!user || isOwnerEmail(user.email)) return { ok: true, suspendedUser: false }
  await setUserStatus(user.id, 'suspended')
  return { ok: true, suspendedUser: true }
}

export interface InviteView {
  id: string
  email: string
  status: string
  note: string | null
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
  expired: boolean
}

/** Every invite, newest first (owner's admin page; no user content). */
export async function listInvites(now: Date = new Date()): Promise<InviteView[]> {
  const rows = await db
    .select({
      id: invites.id,
      email: invites.email,
      status: invites.status,
      note: invites.note,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .orderBy(desc(invites.createdAt))
    .limit(500)
  return rows.map((r) => ({ ...r, expired: r.status === 'pending' && r.expiresAt <= now }))
}

export type SignInDecision =
  | { allow: true; via: 'owner' | 'existing' | 'invite' }
  | { allow: false; reason: 'unverified' | 'suspended' | 'not_invited' | 'cap_reached' }

/**
 * The sign-in gate (spec §2.2), in order: the email must be verified by
 * Google; the owner is always admitted; an existing active account is
 * admitted and a suspended one refused; a live invite admits a new account
 * while there is a seat; everyone else is refused (no user row is created).
 */
export async function signInDecision(
  rawEmail: string | null | undefined,
  emailVerified: boolean,
  client: DbClient = db,
  now: Date = new Date(),
): Promise<SignInDecision> {
  const email = normalizeEmail(rawEmail)
  if (!email || !emailVerified) return { allow: false, reason: 'unverified' }
  if (isOwnerEmail(email)) return { allow: true, via: 'owner' }
  const [user] = await client
    .select({ status: users.status })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)
  if (user) return user.status === 'active' ? { allow: true, via: 'existing' } : { allow: false, reason: 'suspended' }
  const [inv] = await client
    .select({ id: invites.id })
    .from(invites)
    .where(and(sql`lower(${invites.email}) = ${email}`, eq(invites.status, 'pending'), gt(invites.expiresAt, now)))
    .limit(1)
  if (!inv) return { allow: false, reason: 'not_invited' }
  // The invite already holds a seat; this re-check only guards a cap lowered later.
  const [{ n } = { n: 0 }] = await client
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.status, 'active'), ne(sql`lower(${users.email})`, ownerLower())))
  return Number(n) < BETA_INVITEE_CAP ? { allow: true, via: 'invite' } : { allow: false, reason: 'cap_reached' }
}

/** Mark the email's live invite accepted by `userId` (after a successful sign-in). */
export async function acceptInvite(rawEmail: string | null | undefined, userId: string, now: Date = new Date()): Promise<boolean> {
  const email = normalizeEmail(rawEmail)
  if (!email || isOwnerEmail(email)) return false
  const rows = await db
    .update(invites)
    .set({ status: 'accepted', acceptedUserId: userId, acceptedAt: now, updatedAt: now })
    .where(and(sql`lower(${invites.email}) = ${email}`, eq(invites.status, 'pending')))
    .returning()
  return rows.length > 0
}
