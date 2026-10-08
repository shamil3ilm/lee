import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs, radarEntries } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { AISkippedError } from '@/lib/ai/signal'
import * as briefsQ from '@/lib/db/queries/radarBriefs'
import { dueCards, gradeCard } from '@/lib/academy/service/reviews'
import { confirmBrief } from '@/lib/radar/brief/confirm'
import { draftBrief } from '@/lib/radar/brief/draft'
import { learnThis } from '@/lib/radar/brief/module'
import { ingestItems } from '@/lib/radar/ingest'
import type { RadarItemInput } from '@/lib/radar/types'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { textFetch } from '@/tests/fixtures/radar/fetch'
import { makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-08T09:00:00Z')
const POST_TEXT =
  'Zorb is a compact decision model for structured choices. It returns calibrated probabilities for every option. ' +
  'You call it over HTTPS with a bearer key and a JSON body. '.repeat(3)
const README_TEXT =
  '# Zorb server\n\nThe Zorb server exposes one HTTP endpoint for predictions and runs on a laptop. ' +
  'Install it with pip and start the server with one command. '.repeat(3)

function item(over: Partial<RadarItemInput>): RadarItemInput {
  return {
    source: 'feeds',
    externalId: 'x',
    kind: 'product',
    title: 'Introducing Zorb',
    url: 'https://openai.com/index/introducing-zorb/',
    publishedAt: new Date('2026-09-15T10:00:00Z'),
    excerpt: 'Zorb is a compact decision model.',
    metrics: { feedId: 'openai' },
    ...over,
  }
}

async function zorbEntry(userId: string): Promise<string> {
  await ingestItems(
    userId,
    [
      item({ externalId: 'openai:1', metrics: { feedId: 'openai', links: ['https://github.com/acme/zorb'] } }),
      item({ source: 'github', externalId: '101', kind: 'repo', title: 'acme/zorb', url: 'https://github.com/acme/zorb', publishedAt: null, metrics: { repoId: 'acme/zorb', createdAt: '2026-09-18' } }),
    ],
    [],
    NOW,
  )
  const [e] = await db.select().from(radarEntries).where(eq(radarEntries.userId, userId))
  return e!.id
}

function pages(robots = { status: 404, body: '' }) {
  return textFetch([
    { match: (u) => u.pathname === '/robots.txt', ...robots },
    { match: (u) => u.host === 'openai.com', body: `<html><body><main>${POST_TEXT}</main></body></html>`, contentType: 'text/html' },
    { match: (u) => u.host === 'raw.githubusercontent.com', body: README_TEXT },
  ])
}

describe('grounded briefs', () => {
  it('needs two primary sources: a news-only entry gets no brief and no model call', async () => {
    const u = await makeUser()
    await ingestItems(u.id, [item({ source: 'gdelt', kind: 'news', externalId: 'g1', url: 'https://news.example.com/zorb', metrics: {} })], [], NOW)
    const [e] = await db.select().from(radarEntries).where(eq(radarEntries.userId, u.id))
    let calls = 0
    const ai = new FixtureAIProvider({ writeRadarBrief: () => { calls += 1; return { what: [], architecture: [], workflow: [], how_to_use: [], tradeoffs: [], security: [], compared_with: [] } } })
    await expect(draftBrief(u.id, e!.id, ai, { offlineSources: false })).rejects.toBeInstanceOf(AISkippedError)
    expect(calls).toBe(0)
    const logs = await db.select().from(aiCallLogs).where(and(eq(aiCallLogs.userId, u.id), eq(aiCallLogs.kind, 'radar_brief')))
    expect(logs.map((l) => [l.status, l.signalCheckCode])).toEqual([['skipped', 'radar_brief_sources']])
  })

  it('needs the sources FETCHED: robots.txt disallowing them means no brief', async () => {
    const u = await makeUser()
    const id = await zorbEntry(u.id)
    const fetchImpl = pages({ status: 200, body: 'User-agent: *\nDisallow: /' })
    await expect(draftBrief(u.id, id, new FixtureAIProvider(), { fetchImpl, limiter: NO_WAIT, offlineSources: false })).rejects.toThrow(
      'Not enough sources for a brief: 0 of 2',
    )
    expect(fetchImpl.calls.every((c) => c.endsWith('/robots.txt'))).toBe(true)
  })

  it('drafts with verbatim citations and a computed timeline, then confirm and Learn this', async () => {
    const u = await makeUser()
    const id = await zorbEntry(u.id)
    const fetchImpl = pages()
    const draft = await draftBrief(u.id, id, new FixtureAIProvider(), { fetchImpl, limiter: NO_WAIT, offlineSources: false, now: NOW })
    expect(fetchImpl.calls).toContain('https://raw.githubusercontent.com/acme/zorb/HEAD/README.md')
    expect(draft.sources.map((s) => [s.id, s.kind])).toEqual([
      ['S1', 'official_post'],
      ['S2', 'repo_readme'],
    ])
    // The fixture's invented quote is dropped; the two real ones are kept.
    expect(draft.sections.what).toHaveLength(2)
    expect(draft.sections.architecture).toEqual([])
    expect(draft.dropped).toBe(1)
    expect(draft.timeline).toEqual([
      { date: '2026-09-15', label: 'Announced on OpenAI News', url: 'https://openai.com/index/introducing-zorb/' },
      { date: '2026-09-18', label: 'Repository created (acme/zorb)', url: 'https://github.com/acme/zorb' },
    ])
    // Nothing is saved before the user confirms.
    expect(await briefsQ.getByEntry(u.id, id)).toBeNull()

    await expect(confirmBrief(u.id, { ...draft, dropped: 0 })).rejects.toThrow('changed after it was checked')
    const saved = await confirmBrief(u.id, draft, [{ section: 'what', index: 1 }])
    expect((saved.sections as typeof draft.sections).what).toHaveLength(1)
    expect(saved.promptVersion).toBe('1.0.0')

    const mod = await learnThis(u.id, id, NOW)
    expect(mod.cards).toHaveLength(1)
    expect(mod.cards[0]?.front).toBe('What is Introducing Zorb?')
    const due = await dueCards(u.id, NOW)
    expect(due.map((c) => [c.cardId, c.skillName])).toEqual([[mod.cards[0]!.id, 'AI Radar']])
    const r = await gradeCard(u.id, mod.cards[0]!.id, 'good', NOW)
    expect(r.intervalDays).toBe(1)
    // Idempotent.
    expect((await learnThis(u.id, id, NOW)).cards).toHaveLength(1)
  })
})
