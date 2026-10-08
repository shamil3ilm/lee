import { describe, expect, it } from 'vitest'
import { employerWatchRows, nextWatchConfig, type WatchSourceLike } from '@/lib/defaults/watch-status'
import { WATCH_EMPLOYERS } from '@/lib/defaults/watch-employers'

const NOW = new Date('2026-10-08T12:00:00Z')
const row = (rows: ReturnType<typeof employerWatchRows>, key: string) => rows.find((r) => r.key === key)!

function src(over: Partial<WatchSourceLike> & Pick<WatchSourceLike, 'id' | 'kind' | 'config'>): WatchSourceLike {
  return { enabled: false, lastPolledAt: null, lastError: null, ...over }
}

describe('employerWatchRows', () => {
  it('lists every employer, "Not added" when the user has no matching source', () => {
    const rows = employerWatchRows([], new Map(), NOW)
    expect(rows).toHaveLength(WATCH_EMPLOYERS.length)
    expect(row(rows, 'adnoc')).toMatchObject({ status: 'not_added', polled: true, watching: false, sourceId: null })
    expect(row(rows, 'dewa')).toMatchObject({ status: 'not_added', polled: false })
  })

  it('polled employers follow the source: polling, waiting, error, off, last opening', () => {
    const adnoc = src({ id: 's1', kind: 'phenom', enabled: true, lastPolledAt: NOW, config: { host: 'jobs.adnoc.ae', pageId: 'page12' } })
    const du = src({ id: 's2', kind: 'oracle_orc', enabled: true, config: { host: 'fa-ewnx-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1001' } })
    const eand = src({ id: 's3', kind: 'oracle_orc', enabled: true, lastError: 'oracle_orc 500', config: { host: 'iaayey.fa.ocs.oraclecloud26.com', siteNumber: 'CX_1' } })
    const enbd = src({ id: 's4', kind: 'oracle_orc', enabled: false, config: { host: 'fa-evlo-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1' } })
    const rows = employerWatchRows([adnoc, du, eand, enbd], new Map([['s1', new Date('2026-10-07T09:00:00Z')]]), NOW)
    expect(row(rows, 'adnoc')).toMatchObject({ status: 'polling', watching: true, lastSeenAt: '2026-10-07T09:00:00.000Z' })
    expect(row(rows, 'du').status).toBe('waiting')
    expect(row(rows, 'eand').status).toBe('error')
    expect(row(rows, 'emirates-nbd')).toMatchObject({ status: 'off', watching: false })
  })

  it('watch links: watching by default, due after a week, off when switched off', () => {
    const dewa = src({ id: 'w1', kind: 'watch', config: { url: 'https://www.dewa.gov.ae/en/about-us/careers', lastCheckedAt: '2026-10-05T08:00:00Z' } })
    const taqa = src({ id: 'w2', kind: 'watch', config: { url: 'https://www.taqa.com/careers/', lastCheckedAt: '2026-09-20T08:00:00Z' } })
    const rta = src({ id: 'w3', kind: 'watch', config: { url: 'https://www.rta.ae/wps/portal/rta/ae/home/about-rta/careers', watching: false } })
    const rows = employerWatchRows([dewa, taqa, rta], new Map(), NOW)
    expect(row(rows, 'dewa')).toMatchObject({ status: 'checked', watching: true, lastCheckedAt: '2026-10-05T08:00:00.000Z' })
    expect(row(rows, 'taqa').status).toBe('check_due')
    expect(row(rows, 'rta')).toMatchObject({ status: 'off', watching: false })
  })
})

describe('nextWatchConfig', () => {
  it('returns a new object with the change, keeping other keys', () => {
    const before = { url: 'https://example.com', reason: 'x' }
    const after = nextWatchConfig(before, { watching: false, checkedAt: NOW })
    expect(after).toEqual({ url: 'https://example.com', reason: 'x', watching: false, lastCheckedAt: NOW.toISOString() })
    expect(before).toEqual({ url: 'https://example.com', reason: 'x' })
    expect(nextWatchConfig(null, {})).toEqual({})
  })
})
