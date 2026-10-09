import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applicationContacts, applications, contacts, discoveries, sources } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as adapters from '@/lib/discovery/adapters'
import { LinkedInPostAdapter, type LinkedInPostDeps } from '@/lib/discovery/adapters/linkedin-post'
import { runDiscoveryForSource } from '@/lib/discovery/service'
import * as messagesQ from '@/lib/db/queries/linkedinPostMessages'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import { saveMasterCV } from '@/lib/documents/master'
import type { GmailMessageContent } from '@/lib/gmail/adapter'
import { ensureLinkedInPostSource } from '@/lib/linkedin-posts/source'
import { importPost } from '@/lib/linkedin-posts/import'
import { draftPostReply } from '@/lib/linkedin-posts/reply-service'
import { trackHiringPost, POSTER_CONTACT_ROLE } from '@/lib/linkedin-posts/track'
import { readSourceLastResult } from '@/lib/discovery/poll-stats'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { companyKey } from '@/lib/integrations/linkedin/company-key'
import { makeUser } from '@/tests/factories'

// SYNTHETIC notification emails (tests/fixtures/linkedin-posts) and people only.
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/linkedin-posts', name), 'utf8')
const AUTH = 'mx.google.com; dkim=pass header.i=@linkedin.com header.s=s1; spf=pass smtp.mailfrom=x@linkedin.com; dmarc=pass (p=REJECT) header.from=linkedin.com'
const NOW = new Date('2026-10-08T09:00:00Z')

function message(id: string, subject: string, body: { html?: string; text?: string }, verified = true): GmailMessageContent {
  return {
    id,
    internalDate: String(NOW.getTime() - 3_600_000),
    headers: [
      { name: 'From', value: 'LinkedIn <notifications-noreply@linkedin.com>' },
      { name: 'Subject', value: subject },
      ...(verified ? [{ name: 'Authentication-Results', value: AUTH }] : []),
    ],
    html: body.html ?? null,
    text: body.text ?? null,
  }
}

function fakeGmail(messages: GmailMessageContent[]): LinkedInPostDeps {
  const byId = new Map(messages.map((m) => [m.id, m]))
  return {
    getTokens: async () => ({ accessToken: 't' }),
    listMessageIds: async () => messages.map((m) => ({ id: m.id, threadId: m.id })),
    getMessageContent: async ({ id }) => byId.get(id) ?? Promise.reject(new Error('gone')),
    record: messagesQ.record,
    prune: messagesQ.pruneOlderThan,
    now: () => NOW,
  }
}

function useAdapter(adapter: LinkedInPostAdapter): void {
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'linkedin_post' ? adapter : null))
}

async function postRows(sourceId: string) {
  return db.select().from(discoveries).where(eq(discoveries.sourceId, sourceId))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('linkedin_post source (Gmail notification emails)', () => {
  it('keeps verified hiring posts only, title-only, with poster and contact; counts parse failures', async () => {
    const u = await makeUser()
    const src = await ensureLinkedInPostSource(u.id, { enable: true })
    useAdapter(
      new LinkedInPostAdapter(
        fakeGmail([
          message('m1', "Layla Haddad posted: We're hiring a Laravel Developer…", { html: fx('single-hiring.html') }),
          message('m2', 'Top posts for you', { html: fx('digest.html') }),
          message('m3', 'Omar Saleh shared a post', { html: fx('shared.html') }),
          message('m4', 'Rahul Menon posted', { html: fx('not-hiring.html') }),
          message('m5', 'Fatima Rahman posted', { text: fx('single-hiring.txt') }),
          // Spoofed: claims LinkedIn, no Google authentication result.
          message('m6', 'Mallory posted', { html: fx('single-hiring.html').replace('7300000000000000001', '7300000000000000099') }, false),
          // A post notification LinkedIn redesigned: counted, not thrown.
          message('m7', 'Jane posted', { html: '<html><body><p>New layout we cannot read</p></body></html>' }),
        ]),
      ),
    )
    const r = await runDiscoveryForSource({ userId: u.id, sourceId: src.id, ai: new FixtureAIProvider() })
    expect(r.status).toBe('polled')
    expect(r.stats?.parseFailures).toBe(1)

    const rows = await postRows(src.id)
    expect(rows.map((d) => d.sourceJobId).sort()).toEqual([
      'post:activity:7300000000000000001',
      'post:activity:7300000000000000002',
      'post:activity:7300000000000000007',
      'post:share:7300000000000000005',
      'post:ugcPost:7300000000000000004',
    ])
    const dubai = rows.find((d) => d.sourceJobId === 'post:activity:7300000000000000001')!
    const n = dubai.normalized as NormalizedJob
    expect(n).toMatchObject({
      title: 'Laravel Developer',
      companyName: 'Dune Soft Systems',
      companyDomain: 'dunesoft.example',
      location: 'Dubai, UAE',
      descriptionMd: '',
      applyUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/',
      subSource: 'linkedin_post',
    })
    expect(n.post).toMatchObject({
      via: 'email',
      posterName: 'Layla Haddad',
      posterUrl: 'https://www.linkedin.com/in/layla-haddad-x1y2/',
      contact: { emails: ['careers@dunesoft.example'], dm: false },
      hiring: true,
    })
    expect(new TextEncoder().encode(n.post!.snippet).length).toBeLessThanOrEqual(1000)
    // The raw payload holds ids only: no body, no recipient tokens.
    expect(JSON.stringify(dubai.raw)).not.toMatch(/hiring a Laravel|midToken|otpToken/)
    // Low confidence: the Match Score rests on the title; Paste the JD applies.
    expect((dubai.fitDetail as { confidence?: string }).confidence).toBe('title_only')

    const summary = await messagesQ.summary(u.id)
    expect(summary).toMatchObject({ emails: 6, hiring: 5, failed: 1 })
    const [after] = await db.select().from(sources).where(eq(sources.id, src.id))
    expect(readSourceLastResult(after!.lastResult)?.parseFailures).toBe(1)
  })

  it('reports Gmail not connected as a poll failure, not a crash', async () => {
    const u = await makeUser()
    const src = await ensureLinkedInPostSource(u.id, { enable: true })
    const { NoGoogleAccountError } = await import('@/lib/google/tokens')
    useAdapter(new LinkedInPostAdapter({ ...fakeGmail([]), getTokens: async () => Promise.reject(new NoGoogleAccountError()) }))
    const r = await runDiscoveryForSource({ userId: u.id, sourceId: src.id, ai: new FixtureAIProvider() })
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/Gmail/)
  })
})

describe('pasted posts', () => {
  it('imports pasted post text as a linkedin_post discovery and dedupes a second paste', async () => {
    const u = await makeUser()
    const input = {
      via: 'paste' as const,
      text: 'Urgent requirement: PHP Developer (Laravel) for our client in Kuwait City. Share your resume at hr@gulfstaff.example',
      postUrl: 'https://www.linkedin.com/posts/ahmed-karim-kw_hiring-php-activity-7300000000000000002-Xy9Z?utm_source=share',
      posterName: 'Ahmed Karim',
      posterHeadline: 'HR Manager at Gulf Staffing Partners',
      posterUrl: null,
      role: '',
      company: '',
    }
    const first = await importPost(u.id, input, new FixtureAIProvider())
    expect(first.duplicate).toBe(false)
    const [row] = await db.select().from(discoveries).where(eq(discoveries.id, first.discoveryId!))
    expect(row!.sourceJobId).toBe('post:activity:7300000000000000002')
    expect((row!.normalized as NormalizedJob).title).toBe('PHP Developer (Laravel)')
    expect((row!.normalized as NormalizedJob).companyName).toBe('Gulf Staffing Partners')
    // Pasted posts are title-only too (Paste the JD on the card).
    expect((row!.fitDetail as { confidence?: string } | null)?.confidence).toBe('title_only')
    expect((await importPost(u.id, input, new FixtureAIProvider())).duplicate).toBe(true)
    // The source exists but stays off until the user turns on Gmail reading.
    const [src] = await db.select().from(sources).where(and(eq(sources.userId, u.id), eq(sources.kind, 'linkedin_post')))
    expect(src!.enabled).toBe(false)
  })

  it('stores a URL-only paste as a link and never fetches it', async () => {
    const u = await makeUser()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await importPost(
      u.id,
      { via: 'paste', text: '', postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000011/', posterName: '', posterHeadline: '', posterUrl: null, role: '', company: '' },
      new FixtureAIProvider(),
    )
    const [row] = await db.select().from(discoveries).where(eq(discoveries.id, r.discoveryId!))
    expect((row!.normalized as NormalizedJob).title).toBe('LinkedIn post (paste its text)')
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('linkedin.com'))).toBe(false)
  })

  it('Scam Shield flags a post that asks for fees (Gulf rules on post text)', async () => {
    const u = await makeUser()
    const r = await importPost(
      u.id,
      {
        via: 'paste',
        text: "We're hiring drivers and IT staff for Dubai! Visa + job guaranteed. Pay the visa processing fee of AED 2,500 and send your passport with the payment. WhatsApp only.",
        postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000012/',
        posterName: 'Quick Visa Jobs',
        posterHeadline: '',
        posterUrl: null,
        role: '',
        company: '',
      },
      new FixtureAIProvider(),
    )
    expect(r.quarantined).toBe(true)
    const risk = (await riskQ.mapForTargets(u.id, 'discovery', [r.discoveryId!])).get(r.discoveryId!)
    expect(risk?.level).toBe('likely_scam')
  })
})

describe('acting on a hiring post', () => {
  async function seeded() {
    const u = await makeUser()
    await saveMasterCV(u.id, {
      basics: { name: 'Sam Example', headline: 'Backend developer' },
      summary: '',
      experience: [{ company: 'Example Fintech', role: 'Backend Developer', start: '2023-01', end: 'present', bullets: ['Built payment gateway webhooks with retries in Laravel'] }],
      skills: { primary: ['Laravel', 'MySQL', 'Redis'] },
    })
    const r = await importPost(
      u.id,
      {
        via: 'paste',
        text: "We're hiring a Laravel Developer in Dubai! PHP and MySQL. Send your CV to careers@dunesoft.example #hiring",
        postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/',
        posterName: 'Layla Haddad',
        posterHeadline: 'Talent Acquisition Lead at Dune Soft Systems',
        posterUrl: 'https://www.linkedin.com/in/layla-haddad-x1y2/?trk=x',
        role: '',
        company: 'Dune Soft Systems',
      },
      new FixtureAIProvider(),
    )
    return { u, id: r.discoveryId! }
  }

  it('drafts a fact-locked reply and shows the referral hints', async () => {
    const { u, id } = await seeded()
    await linkedinQ.upsertConnections(u.id, [
      { name: 'Layla Haddad', company: 'Dune Soft Systems', companyKey: companyKey('Dune Soft Systems'), position: 'Talent Acquisition Lead', connectedOn: null, email: null },
      { name: 'Ravi Sample', company: 'Dune Soft Systems LLC', companyKey: companyKey('Dune Soft Systems LLC'), position: 'Engineer', connectedOn: null, email: null },
    ])
    const plan = await draftPostReply(u.id, id, { ai: null })
    expect(plan.draft.channel).toBe('email')
    expect(plan.draft.to).toBe('careers@dunesoft.example')
    expect(plan.draft.body).toMatch(/^Hi Layla,/)
    expect(plan.draft.body).toContain('Laravel Developer role at Dune Soft Systems in Dubai')
    expect(plan.draft.body).toContain('Laravel, MySQL')
    expect(plan.posterIsConnection).toBe(true)
    expect(plan.referral?.count).toBe(2)

    // An AI rewrite that invents a fact is rejected; the template stays.
    const ai = new FixtureAIProvider({ draftPostReply: () => ({ subject: null, body: 'Hi Layla, I have 9 years of Kubernetes experience.' }) })
    const locked = await draftPostReply(u.id, id, { ai, channel: 'linkedin' })
    expect(locked.draft.origin).toBe('template')
    expect(locked.draft.rejected).toEqual(expect.arrayContaining(['number "9"', 'skill "kubernetes"']))
    const ok = await draftPostReply(u.id, id, { ai: new FixtureAIProvider(), channel: 'linkedin' })
    expect(ok.draft.origin).toBe('ai')
  })

  it('tracks the post as an application with the poster as recruiter and schedules the follow-up', async () => {
    const { u, id } = await seeded()
    const t = await trackHiringPost(u.id, id, { sent: true, now: NOW })
    const [app] = await db.select().from(applications).where(eq(applications.id, t.applicationId))
    expect(app).toMatchObject({ source: 'linkedin_hiring_post', status: 'applied' })
    expect(t.followupDueAt).not.toBeNull()
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, t.contactId!))
    expect(contact).toMatchObject({ name: 'Layla Haddad', role: POSTER_CONTACT_ROLE, linkedinUrl: 'https://www.linkedin.com/in/layla-haddad-x1y2/' })
    const links = await db.select().from(applicationContacts).where(eq(applicationContacts.applicationId, t.applicationId))
    expect(links.map((l) => l.role)).toEqual(['recruiter'])
    // The employer is the post's address domain, never linkedin.com.
    const again = await trackHiringPost(u.id, id, { sent: false })
    expect(again).toMatchObject({ applicationId: t.applicationId, alreadyTracked: true })
    const full = await db.query.applications.findFirst({ where: eq(applications.id, t.applicationId), with: { job: { with: { company: true } } } })
    expect(full?.job.company?.domain).toBe('dunesoft.example')
  })
})
