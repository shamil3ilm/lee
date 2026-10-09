import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, companies, companyDiscoveries, contacts, discoveries, jobs, sources } from '@/lib/db/schema'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as sourcesQ from '@/lib/db/queries/sources'
import { ensureLocalCompaniesSource } from '@/lib/company-discovery/service'
import { previewCompanyReset, resetCompanies, COMPANY_RESET_BATCH } from '@/lib/company-discovery/reset'
import { parseCursors } from '@/lib/company-discovery/cursors'
import { makeApplication, makeCompany, makeContact, makeDiscovery, makeJob, makeSource, makeUser } from '@/tests/factories'

/** "Reset companies": each option and what it never touches. Synthetic rows only. */

type Extra = Partial<companiesQ.CompanyInsert>

async function setup() {
  const u = await makeUser()
  const src = await ensureLocalCompaniesSource(u.id)
  await sourcesQ.update(u.id, src.id, { config: { cursors: { 'dir:technopark': { next: 7, lastPage: 25 } } }, lastPolledAt: new Date() })
  const row = (key: string, name: string, extra: Extra = {}): companiesQ.CompanyInsert => ({
    sourceCompanyId: key,
    name,
    website: `https://${key}.example`,
    domain: `${key}.example`,
    regionIds: ['kochi', 'kerala', 'in'],
    industry: [],
    sizeBand: null,
    stage: null,
    sourceTags: ['directory:technopark'],
    evidence: {},
    normalized: { kind: 'company', name },
    ...extra,
  })
  await companiesQ.upsertCompanies(u.id, src.id, [
    row('found', 'Found Example'),
    row('gone', 'Dismissed Example'),
    row('watched', 'Watched Example'),
    row('saved', 'Saved Example'),
    row('pasted', 'Pasted Example', { sourceTags: ['paste'] }),
    row('searched', 'Searched Example', { sourceTags: ['search'] }),
    row('tracked', 'Tracked Example'),
    row('promoted', 'Promoted Example'),
  ])
  const all = await companiesQ.listCompanies(u.id, { status: 'all', limit: 50 })
  const id = (name: string) => all.find((r) => (r.normalized as { name: string }).name === name)!.id
  await companiesQ.patchCompany(u.id, id('Dismissed Example'), { status: 'dismissed' })
  await companiesQ.patchCompany(u.id, id('Watched Example'), { watch: 'careers', status: 'saved' })
  await companiesQ.patchCompany(u.id, id('Saved Example'), { status: 'saved' })
  // A speculative application and a company promoted to the user's list.
  const company = await makeCompany(u.id, { name: 'Tracked Example' })
  const job = await makeJob(u.id, company.id)
  const app = await makeApplication(u.id, job.id, { status: 'speculative' })
  await companiesQ.patchCompany(u.id, id('Tracked Example'), { applicationId: app.id })
  await db.update(companyDiscoveries).set({ addedCompanyId: company.id }).where(eq(companyDiscoveries.id, id('Promoted Example')))
  const contact = await makeContact(u.id, { companyId: company.id })
  // A job posting carrying a growth score copied from a company that goes.
  const jobsSource = await makeSource(u.id, { kind: 'lever', config: { company: 'found' } })
  const posting = await makeDiscovery(u.id, jobsSource.id, { normalized: { title: 'Engineer', companyName: 'Found Example', companyDomain: 'found.example' }, companyGrowth: 70, companyGrowthConfidence: 'medium' })
  return { u, src, app, job, company, contact, posting }
}

const names = async (userId: string) =>
  (await db.select().from(companyDiscoveries).where(eq(companyDiscoveries.userId, userId))).map((r) => (r.normalized as { name: string }).name).sort()

describe('reset companies', () => {
  it('default: removes found and dismissed companies; keeps watched, saved, own and linked; never touches the rest', async () => {
    const s = await setup()
    expect(await previewCompanyReset(s.u.id)).toEqual({ remove: 2, keptWatched: 2, keptOwn: 2, keptLinked: 2 })
    const r = await resetCompanies(s.u.id)
    expect(r).toEqual({ deleted: 2, remaining: false })
    expect(await names(s.u.id)).toEqual(['Pasted Example', 'Promoted Example', 'Saved Example', 'Searched Example', 'Tracked Example', 'Watched Example'])
    // Never touched.
    expect(await db.select().from(applications).where(eq(applications.id, s.app.id))).toHaveLength(1)
    expect(await db.select().from(jobs).where(eq(jobs.id, s.job.id))).toHaveLength(1)
    expect(await db.select().from(companies).where(eq(companies.id, s.company.id))).toHaveLength(1)
    expect(await db.select().from(contacts).where(eq(contacts.id, s.contact.id))).toHaveLength(1)
    // Cursors reset so the next run re-reads every list; growth on postings re-synced.
    const [src] = await db.select().from(sources).where(eq(sources.id, s.src.id))
    expect(parseCursors(src!.config)).toEqual({})
    expect(src!.lastPolledAt).toBeNull()
    const [p] = await db.select().from(discoveries).where(eq(discoveries.id, s.posting.id))
    expect(p).toMatchObject({ companyGrowth: null, companyGrowthConfidence: null })
  })

  it('"Keep watched" off also removes watched and saved companies, still not linked ones', async () => {
    const s = await setup()
    expect((await previewCompanyReset(s.u.id, { keepWatched: false })).remove).toBe(4)
    expect((await resetCompanies(s.u.id, { keepWatched: false })).deleted).toBe(4)
    expect(await names(s.u.id)).toEqual(['Pasted Example', 'Promoted Example', 'Searched Example', 'Tracked Example'])
  })

  it('"Also remove companies I added" removes pasted and searched ones', async () => {
    const s = await setup()
    expect((await resetCompanies(s.u.id, { includeOwn: true })).deleted).toBe(4)
    expect(await names(s.u.id)).toEqual(['Promoted Example', 'Saved Example', 'Tracked Example', 'Watched Example'])
    const s2 = await setup()
    expect((await resetCompanies(s2.u.id, { includeOwn: true, keepWatched: false })).deleted).toBe(6)
    expect(await names(s2.u.id)).toEqual(['Promoted Example', 'Tracked Example'])
  })

  it('is owner-scoped, idempotent and stops at the deadline', async () => {
    const a = await setup()
    const b = await setup()
    await resetCompanies(a.u.id, { keepWatched: false, includeOwn: true })
    expect(await names(b.u.id)).toHaveLength(8)
    expect((await resetCompanies(a.u.id, { keepWatched: false, includeOwn: true })).deleted).toBe(0)
    expect(await resetCompanies(b.u.id, {}, { deadline: Date.now() - 1 })).toEqual({ deleted: 0, remaining: true })
    expect(COMPANY_RESET_BATCH).toBeGreaterThan(0)
  })
})
