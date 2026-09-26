import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companies, sources, userDefaults } from '@/lib/db/schema'
import { applyDefaults } from '@/lib/defaults/apply'
import { DEFAULT_SOURCES, DEFAULTS_VERSION, type DefaultSource } from '@/lib/defaults/catalog'
import { makeFreshUser as makeUser, makeSource } from '@/tests/factories'

async function sourcesOf(userId: string) {
  return db.select().from(sources).where(eq(sources.userId, userId))
}

describe('applyDefaults', () => {
  it('adds every default source (only the chosen few enabled) and their companies, then records the version', async () => {
    const u = await makeUser()
    const r = await applyDefaults(u.id)

    const rows = await sourcesOf(u.id)
    expect(rows).toHaveLength(DEFAULT_SOURCES.length)
    const enabled = rows.filter((s) => s.enabled).map((s) => s.name).sort()
    expect(enabled).toEqual(DEFAULT_SOURCES.filter((d) => d.enabled).map((d) => d.name).sort())
    expect(r.enabledSourceIds).toHaveLength(enabled.length)

    const cos = await db.select().from(companies).where(eq(companies.userId, u.id))
    expect(cos).toHaveLength(DEFAULT_SOURCES.filter((d) => d.company).length)
    // Companies behind enabled boards are watched; the rest are just listed.
    const watched = cos.filter((c) => c.isWatched).map((c) => c.domain).sort()
    expect(watched).toEqual(
      DEFAULT_SOURCES.filter((d) => d.company && d.enabled).map((d) => d.company!.domain).sort(),
    )

    const [state] = await db.select().from(userDefaults).where(eq(userDefaults.userId, u.id))
    expect(state?.version).toBe(DEFAULTS_VERSION)
  })

  it('is idempotent', async () => {
    const u = await makeUser()
    await applyDefaults(u.id)
    const again = await applyDefaults(u.id)
    expect(again.addedSources).toBe(0)
    expect(await sourcesOf(u.id)).toHaveLength(DEFAULT_SOURCES.length)
  })

  it('never re-adds a default the user deleted', async () => {
    const u = await makeUser()
    await applyDefaults(u.id)
    await db.delete(sources).where(and(eq(sources.userId, u.id), eq(sources.kind, 'remoteok')))
    await applyDefaults(u.id)
    const kinds = (await sourcesOf(u.id)).map((s) => s.kind)
    expect(kinds).not.toContain('remoteok')
  })

  it("doesn't duplicate a board the user already added themselves", async () => {
    const u = await makeUser()
    await makeSource(u.id, { kind: 'greenhouse', config: { company: 'Stripe' }, name: 'My Stripe' })
    await applyDefaults(u.id)
    const stripe = (await sourcesOf(u.id)).filter(
      (s) => s.kind === 'greenhouse' && String((s.config as { company?: string }).company).toLowerCase() === 'stripe',
    )
    expect(stripe).toHaveLength(1)
    expect(stripe[0]!.name).toBe('My Stripe')
  })

  it('gives existing users only defaults added in a newer version', async () => {
    const u = await makeUser()
    await applyDefaults(u.id)
    const newer: DefaultSource = {
      key: 'lever:newco', name: 'NewCo (Lever)', kind: 'lever', config: { company: 'newco' }, enabled: false,
      since: DEFAULTS_VERSION + 1,
    }
    // Remove one v1 default: a version bump must not bring it back.
    await db.delete(sources).where(and(eq(sources.userId, u.id), eq(sources.kind, 'hn_whoishiring')))
    const r = await applyDefaults(u.id, {
      catalog: [...DEFAULT_SOURCES, newer],
      version: DEFAULTS_VERSION + 1,
    })
    expect(r.addedSources).toBe(1)
    const kinds = (await sourcesOf(u.id)).map((s) => s.kind)
    expect(kinds).not.toContain('hn_whoishiring')
    expect((await sourcesOf(u.id)).some((s) => s.name === 'NewCo (Lever)')).toBe(true)
  })
})
