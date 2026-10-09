import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import * as adapters from '@/lib/discovery/adapters'
import { EmailAlertAdapter, alertQuery, type EmailAlertDeps } from '@/lib/discovery/adapters/email-alert'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import type { GmailMessageContent } from '@/lib/gmail/adapter'
import { NoGoogleAccountError } from '@/lib/google/tokens'

// Email bodies come from the SYNTHETIC fixtures in tests/fixtures/email-alerts.
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/email-alerts', name), 'utf8')

const auth = (domain: string): string =>
  `mx.google.com; dkim=pass header.i=@${domain} header.s=s1; spf=pass smtp.mailfrom=x@${domain}; dmarc=pass (p=REJECT) header.from=${domain}`

function message(id: string, from: string, domain: string, body: { html?: string; text?: string }, verified = true, subject = 'Your job alert'): GmailMessageContent {
  return {
    id,
    internalDate: String(Date.parse('2026-09-26T06:00:00Z')),
    headers: [
      { name: 'From', value: from },
      { name: 'Subject', value: subject },
      ...(verified ? [{ name: 'Authentication-Results', value: auth(domain) }] : []),
    ],
    html: body.html ?? null,
    text: body.text ?? null,
  }
}

function fakeGmail(messages: GmailMessageContent[], overrides: Partial<EmailAlertDeps> = {}): EmailAlertDeps {
  const byId = new Map(messages.map((m) => [m.id, m]))
  return {
    getTokens: async () => ({ accessToken: 't' }),
    listMessageIds: async () => messages.map((m) => ({ id: m.id, threadId: m.id })),
    getMessageContent: async ({ id }) => {
      const m = byId.get(id)
      if (!m) throw new Error('gone')
      return m
    },
    record: emailAlertsQ.record,
    prune: emailAlertsQ.pruneOlderThan,
    now: () => new Date('2026-09-27T00:00:00Z'),
    ...overrides,
  }
}

function useAdapter(adapter: EmailAlertAdapter): void {
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'email_alert' ? adapter : null))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('email_alert source', () => {
  it('ingests verified alerts as discoveries with extracted fields only, and records per-site counters', async () => {
    const u = await makeUser()
    const src = await sourcesQ.create(u.id, { name: 'Job alerts by email', kind: 'email_alert', config: {} })
    const messages = [
      message('m1', 'LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>', 'linkedin.com', { html: fx('linkedin.html'), text: fx('linkedin.txt') }),
      message('m2', 'Indeed <alert@indeed.com>', 'indeed.com', { html: fx('indeed.html') }),
      message('m3', 'NaukriGulf <alerts@naukrigulf.com>', 'naukrigulf.com', { html: fx('naukrigulf.html') }),
      // Forged: claims LinkedIn, no Google authentication result.
      message('m4', 'LinkedIn <jobalerts-noreply@linkedin.com>', 'linkedin.com', { html: fx('naukri.html') }, false),
    ]
    useAdapter(new EmailAlertAdapter(fakeGmail(messages)))

    const r = await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
    expect(r.errors).toEqual([])
    expect(r.newJobDiscoveries).toBe(3 + 3 + 2)

    const rows = await db.select().from(discoveries).where(eq(discoveries.sourceId, src.id))
    const ids = rows.map((d) => d.sourceJobId).sort()
    expect(ids).toContain('linkedin:4012345678')
    expect(ids).toContain('indeed:0a1b2c3d4e5f6071')
    expect(ids).toContain('naukrigulf:260926000111')
    expect(ids.some((i) => i.startsWith('naukri:'))).toBe(false)

    const careem = rows.find((d) => d.sourceJobId === 'linkedin:4012345678')!
    const raw = careem.raw as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(['canonical', 'company', 'location', 'messageId', 'receivedAt', 'site', 'title', 'url'])
    expect(JSON.stringify(raw)).not.toMatch(/otpToken|<html|<table|Actively recruiting/)
    expect(careem.normalized).toMatchObject({
      title: 'Backend Engineer (Go)',
      companyName: 'Careem',
      applyUrl: 'https://www.linkedin.com/jobs/view/4012345678/',
      subSource: 'linkedin',
      tags: ['via:email_alert', 'site:linkedin', 'link:canonical'],
    })

    const summary = await emailAlertsQ.summaryBySite(u.id)
    expect(summary.map((s) => [s.site, s.alerts, s.jobsFound]).sort()).toEqual([
      ['indeed', 1, 3],
      ['linkedin', 1, 3],
      ['naukrigulf', 1, 2],
    ])
    expect(summary[0]!.lastAlertAt?.toISOString()).toBe('2026-09-26T06:00:00.000Z')
  })

  it('dedupes a job repeated across alerts and polls', async () => {
    const u = await makeUser()
    await sourcesQ.create(u.id, { name: 'alerts', kind: 'email_alert', config: {} })
    const li = (id: string) =>
      message(id, 'jobalerts-noreply@linkedin.com', 'linkedin.com', { html: fx('linkedin.html') })
    useAdapter(new EmailAlertAdapter(fakeGmail([li('a'), li('b')])))
    const first = await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
    const second = await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
    expect(first.newJobDiscoveries).toBe(3)
    expect(second.newJobDiscoveries).toBe(0)
  })

  it('skips an unreadable message instead of failing the poll', async () => {
    const u = await makeUser()
    await sourcesQ.create(u.id, { name: 'alerts', kind: 'email_alert', config: {} })
    const ok = message('ok', 'alert@indeed.com', 'indeed.com', { html: fx('indeed.html') })
    const deps = fakeGmail([ok], {
      listMessageIds: async () => [{ id: 'broken', threadId: 'x' }, { id: 'ok', threadId: 'ok' }],
    })
    useAdapter(new EmailAlertAdapter(deps))
    const r = await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
    expect(r.errors).toEqual([])
    expect(r.newJobDiscoveries).toBe(3)
  })

  it('reports a clear error when Gmail is not connected', async () => {
    const u = await makeUser()
    const src = await sourcesQ.create(u.id, { name: 'alerts', kind: 'email_alert', config: {} })
    useAdapter(
      new EmailAlertAdapter(
        fakeGmail([], {
          getTokens: async () => {
            throw new NoGoogleAccountError()
          },
        }),
      ),
    )
    const r = await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
    expect(r.errors[0]?.message).toMatch(/Connect Google/)
    expect((await sourcesQ.getById(u.id, src.id))?.errorCount).toBe(1)
  })

  it('searches only known senders with alert-like subjects', () => {
    const q = alertQuery()
    expect(q).toMatch(/^from:\(linkedin\.com OR indeed\.com OR indeedemail\.com OR indeedmail\.com OR naukri\.com OR naukrigulf\.com OR bayt\.com OR gulftalent\.com OR glassdoor\.com\) newer_than:7d subject:\(/)
  })
})
