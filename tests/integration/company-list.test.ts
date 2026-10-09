import { describe, expect, it } from 'vitest'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import { ensureLocalCompaniesSource } from '@/lib/company-discovery/service'
import { bulkCompanies, watchCompany } from '@/lib/company-discovery/actions'
import { parseCompanyParams } from '@/app/(authed)/discoveries/companies-data'
import { makeUser } from '@/tests/factories'

/** Discovery › Companies segments, sorts and bulk actions on synthetic rows. */

async function seed() {
  const u = await makeUser()
  const src = await ensureLocalCompaniesSource(u.id)
  const row = (key: string, name: string, extra: Partial<companiesQ.CompanyInsert> = {}): companiesQ.CompanyInsert => ({
    sourceCompanyId: key,
    name,
    website: null,
    domain: null,
    regionIds: ['kochi', 'kerala', 'in'],
    industry: [],
    sizeBand: null,
    stage: null,
    sourceTags: ['paste'],
    evidence: {},
    normalized: { kind: 'company', name },
    ...extra,
  })
  await companiesQ.upsertCompanies(u.id, src.id, [
    row('d:a.example', 'Alpha Example', { website: 'https://a.example', domain: 'a.example', evidence: { openRoles: 2 } }),
    row('d:b.example', 'Beta Example', { website: 'https://b.example', domain: 'b.example', evidence: { openRoles: 9 } }),
    row('n:gamma:in', 'Gamma Example'),
  ])
  const all = await companiesQ.listCompanies(u.id, { status: 'all' })
  const id = (name: string) => all.find((r) => (r.normalized as { name: string }).name === name)!.id
  return { u, id }
}

describe('companies list: segments, sorts and bulk actions', () => {
  it('sorts by most open roles (unknown last) and reads the segment from old links', async () => {
    const { u } = await seed()
    const byRoles = await companiesQ.listCompanies(u.id, { status: 'new', sort: 'roles' })
    expect(byRoles.map((r) => (r.normalized as { name: string }).name)).toEqual(['Beta Example', 'Alpha Example', 'Gamma Example'])
    expect(parseCompanyParams({ status: 'saved' }, 25).view).toBe('watching')
    expect(parseCompanyParams({ view: 'radar', sort: 'roles' }, 25)).toMatchObject({ view: 'radar', sort: 'roles' })
    expect(parseCompanyParams({ view: 'nope', sort: 'nope' }, 25)).toMatchObject({ view: 'suggested', sort: 'fit' })
  })

  it('Watch picks the careers check without a job board; bulk dismiss and watch skip what cannot be done', async () => {
    const { u, id } = await seed()
    expect(await watchCompany(u.id, id('Alpha Example'))).toEqual({ kind: 'careers' })
    const r = await bulkCompanies(u.id, [id('Beta Example'), id('Gamma Example')], 'watch')
    // Gamma has no website: nothing to watch.
    expect(r).toEqual({ done: 1, skipped: 1 })
    expect(await companiesQ.countCompanies(u.id, { status: 'saved' })).toBe(2)
    expect(await companiesQ.countCompanies(u.id, { status: 'saved', watching: true })).toBe(2)
    expect(await bulkCompanies(u.id, [id('Gamma Example')], 'dismiss')).toEqual({ done: 1, skipped: 0 })
    expect(await companiesQ.countCompanies(u.id, { status: 'dismissed' })).toBe(1)
    expect(await companiesQ.countCompanies(u.id, { status: 'all' })).toBe(2)
  })
})
