import { describe, expect, it } from 'vitest'
import { PLAYBOOKS, getPlaybook } from '@/lib/coverage/playbooks'
import { playbooksForUser } from '@/lib/coverage/for-user'
import { alertPresets } from '@/lib/coverage/presets'
import { catalogBoardsFor, regionCoverage, type CoverageSourceRow, type RegionActivity } from '@/lib/coverage/compute'
import { reachFor, sourceReach } from '@/lib/coverage/source-reach'
import { lineRegions, toRowViews } from '@/lib/coverage/view'
import { lineRegionIds, linePlaybook, rollUp, starCandidates } from '@/lib/coverage/line'
import { COVERAGE_BADGE, coverageSummary } from '@/lib/coverage/summary'
import { isRegionId } from '@/lib/regions/tree'
import { suggestAlertQueries } from '@/lib/google-alerts/queries'
import { buildAiModePrompts } from '@/lib/discovery/ai-mode/prompts'
import { EMPTY_PREFS } from '@/lib/discovery/relevance/prefs'
import { EMPTY_DISCOVERY_PREFS } from '@/lib/discovery/relevance/discovery-prefs'

const NONE: RegionActivity = { byStatus: {}, companies: 0, yieldingSources: 0 }
const kw = getPlaybook('kw')!
const ae = getPlaybook('ae')!

function src(kind: string, config: Record<string, unknown>, enabled = true): CoverageSourceRow {
  return { id: `${kind}:${JSON.stringify(config)}`, kind, enabled, config }
}

describe('region playbooks (the onboarding recipe is data)', () => {
  it('every playbook covers known region ids, Kuwait first', () => {
    expect(PLAYBOOKS[0]!.id).toBe('kw')
    expect(PLAYBOOKS[1]!.id).toBe('ae')
    for (const p of PLAYBOOKS) for (const c of p.covers) expect(isRegionId(c), `${p.id}:${c}`).toBe(true)
  })

  it('builds alert-setup links for Kuwait on the sites whose alerts lee reads', () => {
    const presets = alertPresets(kw, 'Laravel developer')
    expect(presets.map((p) => p.site)).toEqual(['linkedin', 'bayt', 'naukrigulf', 'indeed', 'gulftalent'])
    expect(presets.every((p) => p.parsed)).toBe(true)
    expect(presets.find((p) => p.site === 'linkedin')!.url).toBe('https://www.linkedin.com/jobs/search/?keywords=Laravel%20developer&location=Kuwait')
    expect(presets.find((p) => p.site === 'indeed')!.url).toContain('https://kw.indeed.com/jobs?q=')
    expect(presets.find((p) => p.site === 'naukrigulf')!.url).toBe('https://www.naukrigulf.com/laravel-developer-jobs-in-kuwait')
    expect(presets.find((p) => p.site === 'bayt')!.url).toBe('https://www.bayt.com/en/kuwait/jobs/laravel-developer-jobs/')
    expect(alertPresets(ae, 'data analyst').find((p) => p.site === 'naukrigulf')!.url).toBe('https://www.naukrigulf.com/data-analyst-jobs-in-uae')
    expect(alertPresets(getPlaybook('kochi')!, 'data analyst').find((p) => p.site === 'indeed')!.url).toContain('in.indeed.com')
  })
})

describe('which regions a user sees', () => {
  it('expands the GCC and Kerala selections, puts starred regions first and adds remote', () => {
    const rows = playbooksForUser({
      regionIds: ['gcc', 'kerala'],
      otherCountries: ['DE'],
      remoteScope: 'worldwide',
      preferred: [{ id: 'ae', level: 'preferred' }, { id: 'kw', level: 'top' }],
    })
    const ids = rows.map((r) => r.playbook.id)
    expect(ids.slice(0, 2)).toEqual(['kw', 'ae'])
    expect(ids).toEqual(expect.arrayContaining(['sa', 'qa', 'bh', 'om', 'kochi', 'thiruvananthapuram', 'kozhikode', 'remote', 'europe']))
    expect(ids).not.toContain('bengaluru')
    expect(rows[0]!.starred).toBe('top')
  })

  it('leaves remote out when remote is off', () => {
    expect(playbooksForUser({ regionIds: ['kw'], otherCountries: [], remoteScope: 'none', preferred: [] }).map((r) => r.playbook.id)).toEqual(['kw'])
  })
})

describe('source reach', () => {
  it('reads a board region from the catalog, a park from its kind, and set-up sources as any region', () => {
    expect(reachFor(sourceReach('oracle_orc', { host: 'fa-ewqb-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'JobSearch-GulfBank' }), kw.covers)).toBe('region')
    expect(reachFor(sourceReach('himalayas', {}), kw.covers)).toBe('broad')
    expect(reachFor(sourceReach('email_alert', {}), kw.covers)).toBe('setup')
    expect(reachFor(sourceReach('infopark', {}), ['kochi'])).toBe('region')
    expect(reachFor(sourceReach('infopark', {}), kw.covers)).toBeNull()
    // A custom board lee knows nothing about counts nowhere until it yields.
    expect(reachFor(sourceReach('greenhouse', { company: 'unknown-co' }), kw.covers)).toBeNull()
  })

  it('the catalog ships Kuwait boards (the canary that was empty)', () => {
    const keys = catalogBoardsFor(kw).map((d) => d.key)
    expect(keys).toEqual(expect.arrayContaining(['oracle_orc:gulfbank', 'oracle_orc:kfh', 'rss:boubyan', 'rss:tap-payments', 'workable:agility', 'pinpoint:tabby']))
  })
})

describe('coverage status and next steps', () => {
  it('red only when nothing at all can bring Kuwait jobs in', () => {
    const c = regionCoverage({ playbook: kw, sources: [], activity: NONE, query: 'Laravel developer', alertSitesSeen: new Set() })
    expect(c.status).toBe('red')
    expect(c.why).toBe('No source covers Kuwait yet, and no Kuwait jobs arrived this week.')
  })

  it('broad and alert sources count as coverage (thin, not none); suggests boards, an alert, the watch list and a Google Alert', () => {
    const c = regionCoverage({ playbook: kw, sources: [src('himalayas', {}), src('email_alert', {})], activity: NONE, query: 'Laravel developer', alertSitesSeen: new Set() })
    expect(c.status).toBe('amber')
    expect(c.regionSources).toBe(0)
    expect(c.broadSources).toBe(1)
    expect(c.setupSources).toBe(1)
    expect(c.why).toBe('No Kuwait board switched on yet; 2 broad or alert sources can include it.')
    expect(c.why).not.toMatch(/Only 0/)
    expect(c.suggestions.map((s) => s.kind)).toEqual(['enable', 'alert', 'watch', 'google-alert'])
    expect(c.suggestions[0]!.text).toMatch(/^Turn on \d+ Kuwait employer boards$/)
    expect(c.suggestions[1]!.text).toBe('Set up a LinkedIn alert for Kuwait')
    expect(c.suggestions[2]!.text).toMatch(/^Check these \d+ Kuwait employers weekly$/)
  })

  it('suggests an alert site the user does not use yet', () => {
    const c = regionCoverage({ playbook: kw, sources: [], activity: NONE, query: 'x', alertSitesSeen: new Set(['linkedin']) })
    expect(c.suggestions.find((s) => s.kind === 'alert')!.text).toBe('Set up a Bayt alert for Kuwait')
  })

  it('amber with boards on but few jobs; green with 3+ boards and 5+ jobs a week', () => {
    const boards = catalogBoardsFor(kw).map((d) => src(d.kind, d.config))
    const amber = regionCoverage({ playbook: kw, sources: boards, activity: { ...NONE, byStatus: { new: 2, filtered: 4 } }, query: 'x', alertSitesSeen: new Set() })
    expect(amber.status).toBe('amber')
    expect(amber.available).toHaveLength(0)
    expect(amber.suggestions.some((s) => s.kind === 'enable')).toBe(false)
    const green = regionCoverage({ playbook: kw, sources: boards, activity: { ...NONE, byStatus: { new: 4, shortlisted: 2 } }, query: 'x', alertSitesSeen: new Set() })
    expect(green.status).toBe('green')
    expect(green.suggestions).toEqual([])
  })

  it('the one-line summary names starred regions only (never the weakest)', () => {
    const red = regionCoverage({ playbook: kw, sources: [], activity: NONE, query: 'x', alertSitesSeen: new Set() })
    const views = toRowViews([
      { ...red, starred: null, employerBoards: 12 },
      { ...regionCoverage({ playbook: ae, sources: [], activity: { ...NONE, yieldingSources: 2, byStatus: { new: 9 } }, query: 'x', alertSitesSeen: new Set() }), starred: 'top', employerBoards: 0 },
    ])
    expect(views.find((v) => v.id === 'kw')?.employerBoards).toBe(12)
    expect(lineRegions(views).map((r) => r.id)).toEqual(['ae'])
    expect(lineRegions(views.map((v) => ({ ...v, starred: null })))).toEqual([])
  })
})

describe('the Discovery coverage line', () => {
  it('rolls starred cities up to their state or country, keeps the higher star, top first', () => {
    expect(rollUp('kozhikode')).toBe('kerala')
    expect(rollUp('kw')).toBe('kw')
    const rows = lineRegionIds([
      { id: 'kochi', level: 'preferred' },
      { id: 'kozhikode', level: 'top' },
      { id: 'kw', level: 'top' },
      { id: 'ae', level: 'preferred' },
    ])
    expect(rows).toEqual([
      { id: 'kerala', level: 'top' },
      { id: 'kw', level: 'top' },
      { id: 'ae', level: 'preferred' },
    ])
    expect(lineRegionIds([])).toEqual([])
  })

  it('measures a rolled-up state with a minimal playbook and a country with its own', () => {
    expect(linePlaybook('kw')).toBe(kw)
    expect(linePlaybook('kerala')).toMatchObject({ id: 'kerala', label: 'Kerala', covers: ['kerala'] })
    expect(linePlaybook('remote-worldwide').id).toBe('remote')
  })

  it('a starred state counts its region boards and a Kerala-wide posting', () => {
    const c = regionCoverage({
      playbook: linePlaybook('kerala'),
      sources: [src('infopark', {}), src('technopark', {}), src('email_alert', {})],
      activity: { ...NONE, byStatus: { new: 6 } },
      query: 'x',
      alertSitesSeen: new Set(),
    })
    expect(c.regionSources).toBe(2)
    expect(c.status).toBe('green')
  })

  it('summarises sources including broad and alert ones, with plain words', () => {
    expect(coverageSummary({ regionSources: 2, broadSources: 0, setupSources: 2, kept: 12 })).toBe('4 sources incl. 2 alerts · 12 jobs this week')
    expect(coverageSummary({ regionSources: 0, broadSources: 1, setupSources: 0, kept: 1 })).toBe('1 source · 1 job this week')
    expect(coverageSummary({ regionSources: 0, broadSources: 0, setupSources: 0, kept: 0 })).toBe('no source yet · 0 jobs this week')
    expect(Object.values(COVERAGE_BADGE)).not.toContain('None coverage')
  })

  it('first-run "Where first?" opens the GCC into countries, Kuwait and the UAE first, Remote last', () => {
    const picks = starCandidates(['gcc', 'kozhikode'], 'worldwide')
    expect(picks.slice(0, 2).map((p) => p.label)).toEqual(['Kuwait', 'UAE'])
    expect(picks.map((p) => p.id)).toEqual(expect.arrayContaining(['sa', 'qa', 'kerala']))
    expect(picks.at(-1)).toEqual({ id: 'remote', label: 'Remote' })
    expect(picks.map((p) => p.id)).not.toContain('kozhikode')
    expect(starCandidates([], 'none').map((p) => p.id)).toContain('in')
  })
})

describe('starred regions reach the alert and AI Mode queries', () => {
  it('a starred Kuwait is not cut by the two-place cap and adds its Arabic queries', () => {
    const q = suggestAlertQueries({
      roleFamilies: ['backend'],
      customRoles: [],
      regions: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'],
      strengths: [],
      careersHosts: [],
      needsVisa: false,
      starred: ['KW'],
      localQueries: kw.localQueries,
    })
    expect(q[0]).toBe('"backend developer" Kuwait hiring')
    expect(q).toContain('وظائف مطور برمجيات الكويت')
  })

  it('AI Mode gets a Kuwait prompt of its own, naming non-tech employers too', () => {
    const prompts = buildAiModePrompts({
      ...EMPTY_PREFS,
      active: true,
      roleFamilies: ['backend', 'data_analyst'],
      regions: ['AE', 'KW'],
      extra: { ...EMPTY_DISCOVERY_PREFS, sponsorshipFor: ['KW'], preferredRegions: [{ id: 'kw', level: 'top' }] },
    })
    expect(prompts[0]!.id).toBe('starred-kw')
    expect(prompts[0]!.prompt).toMatch(/Kuwait \(Kuwait City/)
    expect(prompts[0]!.prompt).toMatch(/banks, insurers, telecoms/)
    expect(prompts[0]!.prompt).toMatch(/visa sponsorship/)
  })
})
