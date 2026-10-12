import { describe, expect, it } from 'vitest'
import { evaluateRelevance, type GateInput } from '@/lib/discovery/relevance/gate'
import { searchPrefsFromProfile, RELEVANCE_RULES_VERSION } from '@/lib/discovery/relevance/prefs'
import { gateColumns, relevanceContext } from '@/lib/discovery/relevance/service'
import { skillOverlap } from '@/lib/discovery/relevance/domain-rule'
import { CALIBRATION_CASES } from '@/tests/eval/calibration-cases'
import { BACKEND_ONLY, BACKEND_PAYMENTS } from '@/tests/eval/discovery-calibration'

/**
 * The gate for non-engineering titles (review 2026-10-10 P0-4). The user's
 * rule: filter only on POSITIVE evidence of an unrelated field, never on a
 * title alone. So a recognised non-engineering title with no tech evidence
 * in its JD is neither filtered nor shown in New: it goes to "Needs a look"
 * (status new, collapsed under New). Synthetic postings.
 */

const prefs = searchPrefsFromProfile(BACKEND_PAYMENTS)
const plain = searchPrefsFromProfile(BACKEND_ONLY)

function caseJob(slice: string, title: string, location = 'Dubai, United Arab Emirates'): GateInput {
  const c = CALIBRATION_CASES.find((x) => x.slice === slice && x.job.title === title && x.job.location === location)
  if (!c) throw new Error(`no case ${slice} ${title}`)
  return { ...c.job, employmentType: 'fulltime' }
}

const inNew = (g: ReturnType<typeof evaluateRelevance>): boolean => g.pass && !g.needsLook

describe('non-engineering titles never land in New on generic words', () => {
  it.each(['Operations Associate', 'Senior Operations Associate - Shops', 'Category Executive', 'Category Manager', 'Training & Quality Executive', 'Strategy & Transformation Associate', 'Partner Success Manager', 'Fleet Operations Executive', 'Account Manager', 'Customer Care Executive', 'Senior Product Designer'])(
    '%s is filtered or needs a look, for both profiles',
    (title) => {
      expect(inNew(evaluateRelevance(caseJob('nontech', title), prefs))).toBe(false)
      expect(inNew(evaluateRelevance(caseJob('nontech', title), plain))).toBe(false)
      if (CALIBRATION_CASES.some((c) => c.slice === 'boilerplate' && c.job.title === title)) {
        expect(inNew(evaluateRelevance(caseJob('boilerplate', title), prefs))).toBe(false)
      }
    },
  )

  /** A non-engineering title in no known field: no positive evidence either way. */
  const growth = (): GateInput => ({ ...caseJob('nontech', 'Operations Associate'), title: 'Growth Associate' })

  it('a non-engineering title in no known field is kept, marked "Needs a look", not filtered', () => {
    const g = evaluateRelevance(growth(), plain)
    expect(g).toMatchObject({ pass: true, needsLook: true })
    expect(g.infos).toContain('Needs a look')
  })

  it('a title in a known non-tech field with generic skills (Excel, SQL, Git) is filtered with the field', () => {
    const g = evaluateRelevance(caseJob('nontech', 'Category Executive'), prefs)
    expect(g.pass).toBe(false)
    expect(g.reasons.join()).toMatch(/domain: Operations\/Business/)
    const designer = evaluateRelevance(caseJob('nontech', 'Senior Product Designer'), prefs)
    expect(designer.reasons.join()).toMatch(/domain: Product\/Design/)
  })

  it('weights generic skills at half, so Excel + SQL do not count as "your skills"', () => {
    const job = { title: 'Category Executive', description: 'Advanced Excel, SQL is a plus, Git', techStack: [], readySkills: ['excel', 'sql', 'git', 'laravel'] }
    expect(skillOverlap(job)).toBe(1.5)
    expect(skillOverlap({ ...job, description: 'Laravel and Excel' })).toBe(1.5)
  })

  it('stores the flag with the gate columns and bumps the rules version', () => {
    const cols = gateColumns(growth(), relevanceContext(BACKEND_ONLY))
    expect(cols.status).toBe('new')
    expect(cols.relevanceNotes).toMatchObject({ needsLook: true })
    expect(RELEVANCE_RULES_VERSION).toBe('r10')
  })
})

describe('tech roles and unknown titles still reach New', () => {
  it.each([
    ['ontarget-gcc', 'Laravel Developer', 'Dubai, United Arab Emirates'],
    ['ontarget-gcc', 'ZATCA Integration Developer', 'Riyadh, Saudi Arabia'],
    ['university-tech', 'Application Developer', 'Abu Dhabi, United Arab Emirates'],
    ['university-tech', 'Web Developer', 'Abu Dhabi, United Arab Emirates'],
    ['university-tech', 'Institutional Research Officer', 'Abu Dhabi, United Arab Emirates'],
  ] as const)('%s %s', (slice, title, location) => {
    const g = evaluateRelevance(caseJob(slice, title, location), prefs)
    expect(inNew(g), g.reasons.join()).toBe(true)
  })

  it('an unknown title with a matching JD is never held back by its title', () => {
    const g = evaluateRelevance(
      { title: 'Product Builder', location: 'Dubai', remoteType: 'onsite', descriptionMd: '## Requirements\n- PHP and Laravel\n- MySQL and Redis\n- REST APIs and webhooks' },
      prefs,
    )
    expect(inNew(g)).toBe(true)
  })
})

describe('university academic and PRO roles do not reach New', () => {
  it.each(['Professor of Accounting', 'Dean, College of Business', 'Mandoub'])('%s', (title) => {
    const g = evaluateRelevance(caseJob('university-nontech', title, 'Abu Dhabi, United Arab Emirates'), prefs)
    expect(inNew(g)).toBe(false)
  })
})

describe('remote residence phrases in the JD', () => {
  it.each([
    'This role is open to candidates located in Indonesia, the Philippines or Vietnam.',
    'Only open to residents of the United States.',
  ])('%s', (sentence) => {
    const g = evaluateRelevance({ title: 'Laravel Developer', location: 'Remote', remoteType: 'remote', descriptionMd: `## Requirements\n- PHP and Laravel\n\n${sentence}` }, prefs)
    expect(g.pass).toBe(false)
    expect(g.reasons.join()).toMatch(/^location: .+-only/)
  })
})
