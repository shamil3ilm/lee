import { describe, expect, it } from 'vitest'
import {
  bulkPlan,
  headerState,
  liveSelection,
  quickSelectCounts,
  quickSelectIds,
  sourceGroupOf,
  toggleAll,
  toggleOne,
  type SelectableSource,
} from '@/lib/sources/selection'
import { BLOCKER, sourceBlocker } from '@/lib/sources/readiness'

const row = (id: string, over: Partial<SelectableSource> = {}): SelectableSource => ({
  id,
  name: `Source ${id}`,
  enabled: false,
  group: 'boards',
  starred: false,
  blocker: null,
  ...over,
})

const ROWS: SelectableSource[] = [
  row('a', { enabled: true, group: 'ats', starred: true }),
  row('b', { group: 'ats' }),
  row('c', { group: 'kerala', starred: true }),
  row('d', { blocker: BLOCKER.adzuna }),
  row('e', { enabled: true, group: 'news' }),
  row('f', { blocker: BLOCKER.gmail, name: 'Job alerts' }),
]

describe('quick select', () => {
  it('All, None, Switched off, starred regions and by type', () => {
    expect([...quickSelectIds(ROWS, 'all')]).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(quickSelectIds(ROWS, 'none').size).toBe(0)
    expect([...quickSelectIds(ROWS, 'off')]).toEqual(['b', 'c', 'd', 'f'])
    expect([...quickSelectIds(ROWS, 'starred')]).toEqual(['a', 'c'])
    expect([...quickSelectIds(ROWS, 'type:ats')]).toEqual(['a', 'b'])
    expect([...quickSelectIds(ROWS, 'type:kerala')]).toEqual(['c'])
    expect([...quickSelectIds(ROWS, 'type:news')]).toEqual(['e'])
    expect([...quickSelectIds(ROWS, 'type:boards')]).toEqual(['d', 'f'])
  })

  it('counts each chip', () => {
    expect(quickSelectCounts(ROWS)).toEqual({ off: 4, starred: 2, groups: { ats: 2, boards: 2, kerala: 1, news: 1 } })
  })

  it('groups kinds by type', () => {
    expect(sourceGroupOf('greenhouse')).toBe('ats')
    expect(sourceGroupOf('workday')).toBe('ats')
    expect(sourceGroupOf('infopark')).toBe('kerala')
    expect(sourceGroupOf('wp_job_news')).toBe('news')
    expect(sourceGroupOf('himalayas')).toBe('boards')
    expect(sourceGroupOf('rss')).toBe('boards')
    expect(sourceGroupOf('something-legacy')).toBe('boards')
  })
})

describe('select all (tri-state)', () => {
  it('is unchecked with none, mixed with some, checked with all', () => {
    expect(headerState(ROWS, new Set())).toEqual({ checked: false, indeterminate: false, count: 0 })
    expect(headerState(ROWS, new Set(['a', 'b']))).toEqual({ checked: false, indeterminate: true, count: 2 })
    expect(headerState(ROWS, quickSelectIds(ROWS, 'all'))).toEqual({ checked: true, indeterminate: false, count: 6 })
  })

  it('selects everything, then nothing once everything is selected', () => {
    const all = toggleAll(ROWS, new Set(['a']))
    expect(all.size).toBe(6)
    expect(toggleAll(ROWS, all).size).toBe(0)
  })

  it('ignores ids no longer on the page', () => {
    const selected = new Set(['a', 'gone'])
    expect(liveSelection(ROWS, selected)).toEqual(['a'])
    expect(headerState(ROWS, selected).count).toBe(1)
    expect(headerState([], selected)).toEqual({ checked: false, indeterminate: false, count: 0 })
  })

  it('toggles one id without mutating the set', () => {
    const before = new Set(['a'])
    const after = toggleOne(before, 'b', true)
    expect([...after]).toEqual(['a', 'b'])
    expect([...before]).toEqual(['a'])
    expect([...toggleOne(after, 'a', false)]).toEqual(['b'])
  })
})

describe('bulkPlan', () => {
  it('turns on only off sources lee can poll; the rest are listed with the reason', () => {
    const plan = bulkPlan(ROWS, quickSelectIds(ROWS, 'all'))
    expect(plan.selected).toBe(6)
    expect(plan.turnOn).toEqual(['b', 'c'])
    expect(plan.turnOff).toEqual(['a', 'e'])
    expect(plan.check).toEqual(['a', 'e'])
    expect(plan.blocked).toEqual([
      { reason: BLOCKER.adzuna, names: ['Source d'] },
      { reason: BLOCKER.gmail, names: ['Job alerts'] },
    ])
  })

  it('an on source that needs setup is not checked but can be turned off', () => {
    const rows = [row('x', { enabled: true, blocker: BLOCKER.adzuna })]
    const plan = bulkPlan(rows, new Set(['x']))
    expect(plan).toMatchObject({ turnOn: [], turnOff: ['x'], check: [], blocked: [] })
  })

  it('is empty with nothing selected', () => {
    expect(bulkPlan(ROWS, new Set())).toEqual({ selected: 0, turnOn: [], turnOff: [], check: [], blocked: [] })
  })
})

describe('sourceBlocker', () => {
  const none = { gmailRead: false, adzunaKey: false }
  const all = { gmailRead: true, adzunaKey: true }

  it('needs an Adzuna key for Adzuna', () => {
    expect(sourceBlocker('adzuna', {}, none)).toBe(BLOCKER.adzuna)
    expect(sourceBlocker('adzuna', {}, all)).toBeNull()
  })

  it('needs Gmail for job-alert email and LinkedIn posts', () => {
    expect(sourceBlocker('email_alert', {}, none)).toBe(BLOCKER.gmail)
    expect(sourceBlocker('linkedin_post', {}, none)).toBe(BLOCKER.gmail)
    expect(sourceBlocker('email_alert', {}, all)).toBeNull()
  })

  it('Google Alerts works with Gmail or its RSS feed', () => {
    expect(sourceBlocker('google_alerts', {}, none)).toBe(BLOCKER.googleAlerts)
    expect(sourceBlocker('google_alerts', { rssUrl: 'https://www.google.com/alerts/feeds/1/2' }, none)).toBeNull()
    expect(sourceBlocker('google_alerts', {}, all)).toBeNull()
  })

  it('never-polled and unknown kinds are excluded', () => {
    expect(sourceBlocker('manual_import', {}, all)).toBe(BLOCKER.neverPolled)
    expect(sourceBlocker('local_companies', {}, all)).toBe(BLOCKER.neverPolled)
    expect(sourceBlocker('yc', {}, all)).toBe(BLOCKER.unknownKind)
  })

  it('public boards need nothing', () => {
    for (const kind of ['greenhouse', 'himalayas', 'rss', 'infopark', 'wp_job_news']) expect(sourceBlocker(kind, {}, none)).toBeNull()
  })
})
