/**
 * Invite-only beta limits (docs/superpowers/specs/2026-10-08-lee-invite-beta-design.md).
 * Pure constants, safe to import anywhere.
 */

/** Invitees (active non-owner accounts + live pending invites), owner excluded. */
export const BETA_INVITEE_CAP = 100

/** A pending invite expires after this many days. */
export const INVITE_TTL_DAYS = 30

/** How long a user's access row (status, session version) is cached per process. */
export const ACCESS_CACHE_MS = 30_000

export const USER_STATUSES = ['active', 'suspended'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const INVITE_STATUSES = ['pending', 'accepted', 'revoked'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]
