import { describe, expect, it } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { buildCoverLetterPrompt, COVER_LETTER_PROMPT_VERSION } from '@/lib/ai/prompts/cover-letter'
import { withApplicationFacts } from '@/lib/ai/prompts/application-facts'
import { OUTREACH_LINKEDIN_MESSAGE_PROMPT_VERSION } from '@/lib/ai/prompts/outreach-linkedin-message'
import { OUTREACH_RECRUITER_REPLY_PROMPT_VERSION } from '@/lib/ai/prompts/outreach-recruiter-reply'
import { applicationFacts, factsRegion, type FactsSources } from '@/lib/apply/application-facts'
import { currentJobSchema } from '@/lib/compare/types'
import { discoveryPrefsSchema, parseDiscoveryPrefs } from '@/lib/discovery/relevance/discovery-prefs'
import { discoveryPrefsFromForm } from '@/lib/discovery/relevance/form'
import { makeApplication, makeMasterCV } from '@/tests/eval/factories'

/** Synthetic person: an India-based backend developer who needs a Gulf visa. */
function sources(over: Partial<FactsSources> = {}): FactsSources {
  return {
    prefs: parseDiscoveryPrefs({
      basedIn: 'IN',
      sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
      noticePeriods: ['1_month'],
      relocationIfSponsored: true,
    }),
    basics: { nationality: 'Indian', visaStatus: '', noticePeriod: '' },
    currentJob: null,
    timezone: 'Asia/Kolkata',
    ...over,
  }
}

const dubai = { title: 'Laravel Developer', location: 'Dubai, UAE', remoteType: 'onsite' }
const kochi = { title: 'Backend Developer', location: 'Kochi, Kerala', remoteType: 'onsite' }
const remote = { title: 'Backend Engineer', location: 'Remote', remoteType: 'remote' }

describe('factsRegion', () => {
  it('reads GCC, India and Remote from the posting; anything else has no block', () => {
    expect(factsRegion(dubai)).toBe('gcc')
    expect(factsRegion(kochi)).toBe('india')
    expect(factsRegion(remote)).toBe('remote')
    expect(factsRegion({ title: 'Engineer', location: 'Berlin, Germany', remoteType: 'onsite' })).toBeNull()
  })
})

describe('applicationFacts (private settings only)', () => {
  it('GCC: visa status, notice and relocation by default; nationality only when opted in', () => {
    const f = applicationFacts(dubai, sources())!
    expect(f.region).toBe('gcc')
    expect(f.lines).toEqual([
      { label: 'Visa', value: 'Requires employment visa sponsorship for UAE' },
      { label: 'Notice period', value: '1 month' },
      { label: 'Relocation', value: 'Available to relocate to UAE' },
    ])
    const opted = sources({ prefs: parseDiscoveryPrefs({ ...sources().prefs, share: { nationality: true } }) })
    expect(applicationFacts(dubai, opted)!.lines).toContainEqual({ label: 'Nationality', value: 'Indian' })
  })

  it('GCC: the profile visa wording wins ("available on visit visa")', () => {
    const f = applicationFacts(dubai, sources({ basics: { nationality: '', visaStatus: 'Available on visit visa / requires sponsorship', noticePeriod: '' } }))!
    expect(f.lines[0]).toEqual({ label: 'Visa', value: 'Available on visit visa / requires sponsorship' })
  })

  it('India: notice period; CTC never without the Current job opt-in', () => {
    const job = currentJobSchema.parse({ monthlyGross: 60_000, currency: 'INR', expectedAnnual: 900_000 })
    expect(applicationFacts(kochi, sources({ currentJob: job }))!.lines).toEqual([{ label: 'Notice period', value: '1 month' }])
    const shared = currentJobSchema.parse({ monthlyGross: 60_000, currency: 'INR', expectedAnnual: 900_000, shareCtc: true })
    expect(applicationFacts(kochi, sources({ currentJob: shared }))!.lines).toEqual([
      { label: 'Current CTC', value: '₹7.2 LPA' },
      { label: 'Expected CTC', value: '₹9 LPA' },
      { label: 'Notice period', value: '1 month' },
    ])
  })

  it('Remote: time zone with its UTC offset', () => {
    expect(applicationFacts(remote, sources())!.lines).toEqual([{ label: 'Time zone', value: 'Asia/Kolkata (UTC+05:30)' }])
  })

  it('a toggle turned off drops the fact; nothing to say → no block', () => {
    const off = sources({ prefs: parseDiscoveryPrefs({ ...sources().prefs, share: { visa: false, notice: false, relocation: false, timezone: false } }) })
    expect(applicationFacts(dubai, off)).toBeNull()
    expect(applicationFacts(remote, off)).toBeNull()
  })
})

describe('opt-in storage', () => {
  it('defaults: visa, notice, relocation and time zone on; nationality off; CTC off', () => {
    expect(discoveryPrefsSchema.parse({}).share).toEqual({ visa: true, notice: true, relocation: true, timezone: true, nationality: false })
    expect(currentJobSchema.parse({}).shareCtc).toBe(false)
    expect(currentJobSchema.parse({}).expectedAnnual).toBeNull()
  })

  it('the Search form posts the toggles (unchecked = off)', () => {
    const fd = new FormData()
    fd.append('share_visa', 'on')
    fd.append('share_nationality', 'on')
    expect(discoveryPrefsFromForm(fd).share).toEqual({ visa: true, notice: false, relocation: false, timezone: false, nationality: true })
  })
})

describe('the region block in prompts', () => {
  const facts = applicationFacts(dubai, sources())!
  const app = makeApplication({ role: 'Laravel Developer', company: 'Example Gulf Co', location: 'Dubai, UAE', remoteType: 'onsite' })

  it('GCC: lists only the given facts with the GCC rule', () => {
    const p = withApplicationFacts('PROMPT', facts)
    expect(p).toContain('--- APPLICATION FACTS (GCC; from the candidate’s private settings) ---')
    expect(p).toContain('- Visa: Requires employment visa sponsorship for UAE')
    expect(p).toContain('visa status, notice period and availability to relocate')
    expect(p).not.toMatch(/CTC|Nationality/)
  })

  it('India and Remote rules', () => {
    const india = applicationFacts(kochi, sources())!
    expect(withApplicationFacts('P', india)).toContain('current and expected CTC only if listed')
    const rem = applicationFacts(remote, sources())!
    expect(withApplicationFacts('P', rem)).toContain('time-zone overlap')
  })

  it('without facts the prompt is unchanged', () => {
    expect(withApplicationFacts('PROMPT', null)).toBe('PROMPT')
    expect(buildCoverLetterPrompt({ master: makeMasterCV(), application: app })).not.toContain('APPLICATION FACTS')
  })

  it('prompt versions are bumped', () => {
    expect(COVER_LETTER_PROMPT_VERSION).toBe('1.3.0')
    expect(OUTREACH_LINKEDIN_MESSAGE_PROMPT_VERSION).toBe('1.2.0')
    expect(OUTREACH_RECRUITER_REPLY_PROMPT_VERSION).toBe('1.2.0')
  })

  it('the deterministic fixture provider states the facts', async () => {
    const ai = new FixtureAIProvider()
    const letter = await ai.draftCoverLetter({ master: makeMasterCV(), application: app, facts })
    expect(letter.paragraphs.at(-1)).toBe('Visa: Requires employment visa sponsorship for UAE. Notice period: 1 month. Relocation: Available to relocate to UAE.')
    const reply = await ai.draftOutreach({ master: makeMasterCV(), application: app, kind: 'recruiter_reply', tone: 'formal', facts })
    expect(reply.body).toContain('Visa: Requires employment visa sponsorship for UAE. Notice period: 1 month.')
    const plain = await ai.draftCoverLetter({ master: makeMasterCV(), application: app })
    expect(plain.paragraphs.join(' ')).not.toContain('Visa:')
  })
})
