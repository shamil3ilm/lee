import { describe, expect, it } from 'vitest'
import { LOCAL_HIRE_POINTS, visaComponent } from '@/lib/discovery/match/signals'
import { computeMatch } from '@/lib/discovery/match/score'
import { MATCH_SCORE_VERSION } from '@/lib/discovery/match/version'
import { matchJob, matchProfile } from './discovery-match-helpers'

/** A BambooHR "Admin Staff (Local)" posting: a soft visa deduction, never a filter (m6). */
describe('local hire (m6)', () => {
  const job = matchJob({ title: 'Application Developer', location: 'Jahrah, Kuwait', descriptionMd: 'Build web applications in PHP and Laravel with MySQL.' })

  it('takes a small visa deduction when you need sponsorship in that country', () => {
    expect(visaComponent({ ...job, localHire: true }, matchProfile())).toMatchObject({ points: LOCAL_HIRE_POINTS, label: 'Local hire: likely needs Kuwait residency' })
    expect(LOCAL_HIRE_POINTS).toBe(-4)
    expect(MATCH_SCORE_VERSION).toBe('m6')
  })

  it('no deduction when you are based there, need no sponsorship, or the posting is not a local hire', () => {
    const based = matchProfile()
    expect(visaComponent({ ...job, localHire: true }, { ...based, extra: { ...based.extra, basedIn: 'KW' } }).points).toBe(0)
    expect(visaComponent({ ...job, localHire: true }, { ...based, extra: { ...based.extra, sponsorshipFor: [] } }).points).toBe(0)
    expect(visaComponent(job, based).label).toBe('Visa: not mentioned (you need sponsorship in Kuwait)')
  })

  it('an offered visa still wins over the local-hire status', () => {
    const r = visaComponent({ ...job, localHire: true, descriptionMd: 'Employment visa provided.' }, matchProfile())
    expect(r.label).toBe('Visa: offered for Kuwait')
  })

  it('lowers the score a little, and the reason shows', () => {
    const plain = computeMatch(job, matchProfile())
    const local = computeMatch({ ...job, localHire: true }, matchProfile())
    expect(local.score).toBeLessThan(plain.score)
    expect(plain.score - local.score).toBeLessThanOrEqual(4)
    expect(JSON.stringify(local)).toContain('Local hire: likely needs Kuwait residency')
  })
})
