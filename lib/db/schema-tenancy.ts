import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './schema'

// ---------------------------------------------------------------------------
// Invite-only beta (docs/superpowers/specs/2026-10-08-lee-invite-beta-design.md
// §2). Re-exported from ./schema.ts.
// ---------------------------------------------------------------------------

/**
 * One row per invite the owner sends. The gate is the (lower-cased) email
 * itself: there is no token. At most one live (pending or accepted) invite
 * per email. `note` is the owner's own label, never shown to the invitee.
 */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    // 'pending' | 'accepted' | 'revoked'
    status: text('status').notNull().default('pending'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedUserId: uuid('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    liveEmailUq: uniqueIndex('invites_live_email_uq')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.status} in ('pending', 'accepted')`),
    statusIx: index('invites_status_idx').on(t.status),
  }),
)
