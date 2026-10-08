import { describe, it, expect } from 'vitest'
import { buildAiModePrompts, aiModeSearchUrl } from '@/lib/discovery/ai-mode/prompts'
import { piiTermsFromProfile, scrubPii } from '@/lib/discovery/ai-mode/pii'
import { levelPhrase } from '@/lib/discovery/ai-mode/phrases'
import { EMPTY_PREFS, searchPrefsFromProfile, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { EMPTY_DISCOVERY_PREFS } from '@/lib/discovery/relevance/discovery-prefs'

// Synthetic identity: none of this is real.
const RESUME = {
  basics: { name: 'Avery Quill Example', email: 'avery.example@example.com', phone: '+971 50 123 4567' },
  work: [{ name: 'Initech Payments' }, { name: 'Globex Solutions' }],
  education: [{ institution: 'Example State University' }],
}
const PII = piiTermsFromProfile(RESUME)

function prefs(over: Partial<SearchPrefs> = {}): SearchPrefs {
  return { ...EMPTY_PREFS, active: true, extra: { ...EMPTY_DISCOVERY_PREFS }, ...over }
}

describe('piiTermsFromProfile / scrubPii', () => {
  it('collects the name and its parts, email, phone, employers and schools', () => {
    expect(PII).toEqual(
      expect.arrayContaining(['Avery Quill Example', 'Avery', 'Quill', 'avery.example@example.com', '+971 50 123 4567', 'Initech Payments', 'Globex Solutions', 'Example State University']),
    )
  })

  it('removes identifiers, emails and phone numbers from free text', () => {
    const out = scrubPii('Initech Payments style backend, mail avery.example@example.com or +971 50 123 4567, Quill', PII)
    expect(out).not.toMatch(/Initech|avery|@|971|Quill/i)
    expect(out).toContain('backend')
  })

  it('keeps words that merely contain an identifier', () => {
    expect(scrubPii('Averyday tooling', ['Avery'])).toBe('Averyday tooling')
  })
})

describe('buildAiModePrompts', () => {
  // The profile itself carries PII-shaped values in free-text preference fields.
  const profile = {
    roleTypes: ['Backend', 'Initech Payments engineer', 'contact avery.example@example.com'],
    seniorityLevels: ['junior', 'mid'],
    locationPrefs: [{ country: 'AE' }, { country: 'SA' }, { country: 'IN' }],
    acceptRelocation: false,
    willingToRelocateTo: [],
    remoteScope: 'regions',
    keywords: ['Laravel', 'Avery Quill Example', '+971 50 123 4567'],
    dealbreakers: [],
    searchPrefsSavedAt: new Date('2026-09-01T00:00:00Z'),
    discoveryPrefs: { sponsorshipFor: ['AE'] },
  }

  it('never includes the name, email, phone, employers or school', () => {
    const prompts = buildAiModePrompts(searchPrefsFromProfile(profile as never), PII)
    const all = prompts.map((p) => p.prompt).join('\n')
    for (const term of ['Avery', 'Quill', 'example.com', '@', '971', '123 4567', 'Initech', 'Globex', 'Example State']) {
      expect(all).not.toContain(term)
    }
  })

  it('returns one prompt per family from the preferences', () => {
    const prompts = buildAiModePrompts(searchPrefsFromProfile(profile as never), PII)
    expect(prompts.map((p) => p.id)).toEqual(['gcc', 'india', 'remote', 'relocation'])
    const gcc = prompts.find((p) => p.id === 'gcc')!
    expect(gcc.prompt).toMatch(/UAE/)
    expect(gcc.prompt).toMatch(/expatriates/)
    expect(gcc.prompt).toMatch(/visa sponsorship/)
    expect(prompts.some((p) => p.id === 'india')).toBe(true)
    expect(prompts.some((p) => p.id === 'remote')).toBe(true)
  })

  it('asks for junior, mid and senior roles that experience or domain fit could qualify for', () => {
    const phrase = levelPhrase(prefs({ include: ['Laravel', 'payments'] }))
    expect(phrase).toMatch(/junior, mid-level and senior/)
    expect(phrase).toMatch(/1–4 years/)
    expect(phrase).toMatch(/Laravel or payments/)
  })

  it('asks for remote roles workable from the home country, without US/EU-only roles', () => {
    const remote = buildAiModePrompts(prefs({ regions: ['IN'] })).find((p) => p.id === 'remote')!
    expect(remote.prompt).toMatch(/done from India: remote worldwide, APAC, EMEA or India-friendly time zones/)
    expect(remote.prompt).toMatch(/stretch senior/)
    expect(remote.prompt).toMatch(/Leave out US-only and EU-residency-only roles/)
    const basedInUae = buildAiModePrompts(prefs({ extra: { ...EMPTY_DISCOVERY_PREFS, basedIn: 'AE' } })).find((p) => p.id === 'remote')!
    expect(basedInUae.label).toMatch(/United Arab Emirates/)
  })

  it('asks for roles anywhere that offer relocation or visa sponsorship', () => {
    const reloc = buildAiModePrompts(prefs({ roleFamilies: ['backend'] })).find((p) => p.id === 'relocation')!
    expect(reloc.prompt).toMatch(/any country that explicitly offer relocation support and\/or visa sponsorship/)
    expect(reloc.prompt).toMatch(/^Backend/)
  })

  it('falls back to the GCC and India with no saved preferences', () => {
    const prompts = buildAiModePrompts({ ...EMPTY_PREFS, remoteScope: 'none' })
    expect(prompts.map((p) => p.id)).toEqual(['gcc', 'india', 'relocation'])
    expect(prompts[0]!.prompt).toMatch(/software developer/)
  })

  it('skips the remote family when remote work is off', () => {
    const prompts = buildAiModePrompts(prefs({ regions: ['QA'], remoteScope: 'none' }))
    expect(prompts.map((p) => p.id)).toEqual(['gcc', 'relocation'])
  })
})

describe('aiModeSearchUrl', () => {
  it('builds a Google AI Mode link with the prompt encoded', () => {
    const prompt = 'Backend & data jobs in Dubai? 100% remote #1 + visa/sponsor'
    const url = aiModeSearchUrl(prompt)
    expect(url.startsWith('https://www.google.com/search?udm=50&q=')).toBe(true)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('udm')).toBe('50')
    expect(parsed.searchParams.get('q')).toBe(prompt)
    expect(url).not.toMatch(/[ #&]q=.*[ #]/)
    expect(url).toContain('%26')
    expect(url).toContain('%23')
  })

  it('trims and caps the prompt', () => {
    const url = aiModeSearchUrl(`  ${'x'.repeat(5000)}  `)
    expect(new URL(url).searchParams.get('q')).toHaveLength(1000)
  })
})
