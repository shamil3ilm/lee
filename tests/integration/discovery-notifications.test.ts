import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries, sources } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import {
  buildDiscoveryEmail,
  findNotifiableDiscoveries,
  sendDiscoveryEmailIfEnabled,
} from '@/lib/notifications/discovery'
import { makeUser } from '@/tests/factories'

const DAY_MS = 24 * 60 * 60 * 1000

async function seedSource(userId: string): Promise<string> {
  const [src] = await db
    .insert(sources)
    .values({ userId, name: 'HN', kind: 'hn', config: {} })
    .returning()
  if (!src) throw new Error('failed to create source')
  return src.id
}

async function seedDiscovery(
  userId: string,
  sourceId: string,
  overrides: Partial<typeof discoveries.$inferInsert> = {},
) {
  const [row] = await db
    .insert(discoveries)
    .values({
      userId,
      sourceId,
      sourceJobId: `hn-${Math.random().toString(36).slice(2)}`,
      raw: {},
      normalized: { title: 'Senior BE', companyName: 'Stripe' },
      matchScore: 80,
      status: 'new',
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('failed to insert discovery')
  return row
}

describe('findNotifiableDiscoveries', () => {
  it('returns only new discoveries at/above the min score and after since', async () => {
    const u = await makeUser('notify-1@x.com')
    const sid = await seedSource(u.id)
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000) // 12h ago

    // Included: new, high score, created after since.
    const wanted = await seedDiscovery(u.id, sid, {
      matchScore: 90,
      normalized: { title: 'Senior BE', companyName: 'Stripe' },
    })

    // Excluded: too low.
    await seedDiscovery(u.id, sid, {
      matchScore: 60,
      normalized: { title: 'Junior BE', companyName: 'LowMatch' },
    })

    // Excluded: dismissed.
    await seedDiscovery(u.id, sid, {
      matchScore: 95,
      status: 'dismissed',
      normalized: { title: 'Dismissed', companyName: 'Old' },
    })

    // Excluded: created before since — force createdAt older than window.
    const stale = await seedDiscovery(u.id, sid, {
      matchScore: 95,
      normalized: { title: 'Stale', companyName: 'Old' },
    })
    // Backdate the "stale" row so it's older than `since` and gt() excludes it.
    await db
      .update(discoveries)
      .set({ createdAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(discoveries.id, stale.id))

    const items = await findNotifiableDiscoveries(u.id, 75, since.toISOString())
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(wanted.id)
    expect(items[0]?.title).toBe('Senior BE')
    expect(items[0]?.companyName).toBe('Stripe')
    expect(items[0]?.matchScore).toBe(90)
  })

  it('extracts a reasoning excerpt from the scoring blob when present', async () => {
    const u = await makeUser('notify-2@x.com')
    const sid = await seedSource(u.id)
    await seedDiscovery(u.id, sid, {
      matchScore: 85,
      matchReasoning: { summary: 'Great fit for backend + fintech background.' },
    })
    const items = await findNotifiableDiscoveries(
      u.id,
      75,
      new Date(Date.now() - DAY_MS).toISOString(),
    )
    expect(items[0]?.reasoningExcerpt).toBe(
      'Great fit for backend + fintech background.',
    )
  })

  it('sorts by match score descending', async () => {
    const u = await makeUser('notify-3@x.com')
    const sid = await seedSource(u.id)
    await seedDiscovery(u.id, sid, {
      matchScore: 78,
      normalized: { title: 'Mid', companyName: 'X' },
    })
    await seedDiscovery(u.id, sid, {
      matchScore: 92,
      normalized: { title: 'Top', companyName: 'Y' },
    })
    await seedDiscovery(u.id, sid, {
      matchScore: 85,
      normalized: { title: 'High', companyName: 'Z' },
    })
    const items = await findNotifiableDiscoveries(
      u.id,
      75,
      new Date(Date.now() - DAY_MS).toISOString(),
    )
    expect(items.map((i) => i.matchScore)).toEqual([92, 85, 78])
  })
})

describe('buildDiscoveryEmail', () => {
  it('renders a subject for a single match', () => {
    const { subject, htmlBody } = buildDiscoveryEmail({
      userEmail: 'x@y.com',
      discoveries: [
        {
          id: '1',
          title: 'Staff Engineer',
          companyName: 'Shopify',
          matchScore: 88,
          reasoningExcerpt: 'Ideal stack overlap.',
          createdAt: new Date(),
        },
      ],
    })
    expect(subject).toContain('Staff Engineer')
    expect(subject).toContain('Shopify')
    expect(htmlBody).toContain('1 new job match')
    expect(htmlBody).toContain('88% match')
    expect(htmlBody).toContain('Ideal stack overlap.')
    expect(htmlBody).toContain('/discoveries')
    expect(htmlBody).toContain('/settings/notifications')
  })

  it('renders a multi-match subject and lists all items', () => {
    const { subject, htmlBody } = buildDiscoveryEmail({
      userEmail: 'x@y.com',
      discoveries: [
        {
          id: '1',
          title: 'Senior BE',
          companyName: 'Stripe',
          matchScore: 91,
          reasoningExcerpt: null,
          createdAt: new Date(),
        },
        {
          id: '2',
          title: 'Staff',
          companyName: 'Shopify',
          matchScore: 87,
          reasoningExcerpt: null,
          createdAt: new Date(),
        },
        {
          id: '3',
          title: 'Lead',
          companyName: 'Deel',
          matchScore: 80,
          reasoningExcerpt: null,
          createdAt: new Date(),
        },
      ],
    })
    expect(subject).toMatch(/^3 new job matches/)
    expect(subject).toContain('Stripe')
    expect(htmlBody).toContain('3 new job matches')
    expect(htmlBody).toContain('Stripe')
    expect(htmlBody).toContain('Shopify')
    expect(htmlBody).toContain('Deel')
  })
})

describe('sendDiscoveryEmailIfEnabled', () => {
  it('is a no-op when the user has notifyDiscoveryEmail=false', async () => {
    const u = await makeUser('notify-disabled@x.com')
    // Defaults leave notifyDiscoveryEmail=false — no profile row needed.
    const send = vi.fn(async () => ({ messageId: 'x' }))
    const result = await sendDiscoveryEmailIfEnabled({ userId: u.id, sendEmail: send })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('disabled')
    expect(send).not.toHaveBeenCalled()
  })

  it('sends and bumps discovery_email_last_sent_at when matches exist', async () => {
    const u = await makeUser('notify-send@x.com')
    const sid = await seedSource(u.id)
    await profileQ.upsert(u.id, {
      notifyDiscoveryEmail: true,
      notifyDiscoveryMinScore: 75,
    })
    await seedDiscovery(u.id, sid, { matchScore: 90 })
    await seedDiscovery(u.id, sid, { matchScore: 82 })

    type SendArgs = { userId: string; to: string; subject: string; htmlBody: string }
    const send = vi.fn(async (_args: SendArgs) => ({ messageId: 'msg-notif' }))
    const result = await sendDiscoveryEmailIfEnabled({ userId: u.id, sendEmail: send })
    expect(result.sent).toBe(true)
    expect(result.count).toBe(2)
    expect(result.messageId).toBe('msg-notif')
    expect(send).toHaveBeenCalledTimes(1)
    const arg = send.mock.calls[0]?.[0] as SendArgs | undefined
    expect(arg?.to).toBe('notify-send@x.com')
    expect(arg?.subject).toContain('new job matches')
    expect(arg?.htmlBody).toContain('90% match')

    const profile = await profileQ.get(u.id)
    expect(profile?.discoveryEmailLastSentAt).not.toBeNull()
  })

  it('skips silently when there are no matches above the threshold', async () => {
    const u = await makeUser('notify-empty@x.com')
    const sid = await seedSource(u.id)
    await profileQ.upsert(u.id, {
      notifyDiscoveryEmail: true,
      notifyDiscoveryMinScore: 90,
    })
    await seedDiscovery(u.id, sid, { matchScore: 60 })
    const send = vi.fn(async () => ({ messageId: 'msg' }))
    const result = await sendDiscoveryEmailIfEnabled({ userId: u.id, sendEmail: send })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('no_matches')
    expect(send).not.toHaveBeenCalled()
  })

  it('uses discovery_email_last_sent_at as the since window on subsequent calls', async () => {
    const u = await makeUser('notify-since@x.com')
    const sid = await seedSource(u.id)
    const lastSent = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
    await profileQ.upsert(u.id, {
      notifyDiscoveryEmail: true,
      notifyDiscoveryMinScore: 75,
      discoveryEmailLastSentAt: lastSent,
    })
    // Old row, created before lastSent — excluded.
    const old = await seedDiscovery(u.id, sid, { matchScore: 90 })
    await db
      .update(discoveries)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(discoveries.id, old.id))
    // Fresh row after lastSent — included.
    await seedDiscovery(u.id, sid, {
      matchScore: 85,
      normalized: { title: 'Fresh', companyName: 'New Co' },
    })

    const send = vi.fn(async () => ({ messageId: 'msg-since' }))
    const result = await sendDiscoveryEmailIfEnabled({ userId: u.id, sendEmail: send })
    expect(result.sent).toBe(true)
    expect(result.count).toBe(1)
  })
})
