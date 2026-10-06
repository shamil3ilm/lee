import { describe, expect, it } from 'vitest'
import { masterCvSchema, type MasterCV } from '@/lib/documents/types'
import { deriveMasterCv, toMasterCv } from '@/lib/resume/derive'
import { fromMasterCv, toResumeDate } from '@/lib/resume/legacy'
import { applyMasterCvEdit } from '@/lib/resume/merge-cv'
import { projectSchema, type ResumeProfile } from '@/lib/resume/types'
import { suggestRoles } from '@/lib/discovery/relevance/suggest'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

function counter(): () => string {
  let n = 0
  return () => `id-${++n}`
}

const LEGACY: MasterCV = masterCvSchema.parse({
  basics: {
    name: 'Asha Menon',
    headline: 'Backend Engineer',
    email: 'asha.menon@example.com',
    phone: '+91 90000 00000',
    location: 'Bengaluru, India',
    github: 'github.com/example-asha',
    linkedin: 'https://www.linkedin.com/in/example-asha',
  },
  summary: 'Builds payment systems.',
  experience: [
    { company: 'PayFlow', role: 'Backend Engineer', start: 'Apr 2021', end: 'present', bullets: ['Cut settlement latency by 40%.'], tech: ['Go'] },
  ],
  projects: [{ name: 'Ledger', description: 'Double-entry ledger', tech: ['Go'], highlights: ['Property tests'] }],
  education: [{ school: 'Example Institute', degree: 'B.Tech', start: '2014', end: '2018' }],
  skills: { primary: ['Go', 'PostgreSQL'], secondary: ['Redis'] },
  languages: [{ name: 'Arabic', proficiency: 'Elementary' }],
})

describe('fromMasterCv (one-time migration of the legacy master CV)', () => {
  it('turns every item into an id-bearing, own, ready profile item', () => {
    const p = fromMasterCv(LEGACY, counter())
    expect(p.basics).toMatchObject({ name: 'Asha Menon', label: 'Backend Engineer', location: { city: 'Bengaluru, India' } })
    expect(p.basics.profiles.map((x) => [x.network, x.url])).toEqual([
      ['GitHub', 'https://github.com/example-asha'],
      ['LinkedIn', 'https://www.linkedin.com/in/example-asha'],
    ])
    expect(p.work[0]).toMatchObject({ name: 'PayFlow', startDate: '2021', endDate: '', keywords: ['Go'] })
    expect(p.work[0]!.highlights[0]).toMatchObject({ text: 'Cut settlement latency by 40%.', depth: 'own', interviewReady: true })
    expect(p.skills.map((g) => [g.name, g.skills.map((s) => s.name)])).toEqual([
      ['Skills', ['Go', 'PostgreSQL']],
      ['More skills', ['Redis']],
    ])
    expect(p.languages[0]).toMatchObject({ language: 'Arabic', fluency: 'basic' })
    const ids = JSON.stringify(p).match(/"id":"[^"]+"/g) ?? []
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reads common date spellings', () => {
    expect(toResumeDate('2021-04')).toBe('2021-04')
    expect(toResumeDate('04/2021')).toBe('2021-04')
    expect(toResumeDate('2021/4')).toBe('2021-04')
    expect(toResumeDate('Apr 2021')).toBe('2021')
    expect(toResumeDate('soon')).toBe('')
  })
})

describe('deriveMasterCv (profile → MasterCV, one-way)', () => {
  it('round-trips the facts of a migrated CV', () => {
    const cv = toMasterCv(fromMasterCv(LEGACY, counter()))!
    expect(cv.experience[0]).toMatchObject({ company: 'PayFlow', bullets: ['Cut settlement latency by 40%.'], tech: ['Go'] })
    expect(cv.skills).toEqual({ primary: ['Go', 'PostgreSQL'], secondary: ['Redis'] })
    expect(cv.basics.phone).toBe('+91 90000 00000') // private ≠ hidden from your own CV
  })

  it('is null until the profile has a name and a headline', () => {
    const p = syntheticProfile()
    expect(toMasterCv({ ...p, basics: { ...p.basics, label: '' } })).toBeNull()
  })

  it('never carries a not-ready item into the CV the AI prompts read', () => {
    const p = syntheticProfile()
    const profile: ResumeProfile = {
      ...p,
      work: p.work.map((w) => ({
        ...w,
        highlights: w.highlights.map((h) =>
          h.id === 'h-zatca' ? { ...h, depth: 'ai_assisted' as const, interviewReady: false, domainReady: false } : h,
        ),
      })),
      projects: [...p.projects, projectSchema.parse({ id: 'pr-vibe', name: 'Vibe Wallet', keywords: ['Rust'], depth: 'ai_assisted', highlights: [{ id: 'h-v', text: 'Wallet in Rust' }] })],
    }
    const text = JSON.stringify(toMasterCv(profile))
    expect(text).not.toContain('ZATCA')
    expect(text).not.toContain('Vibe Wallet')
    expect(text).not.toContain('Rust')
  })

  it('shows a domain-only item only in its design wording, without stack keywords', () => {
    const p = syntheticProfile()
    const profile: ResumeProfile = {
      ...p,
      work: p.work.map((w) => ({
        ...w,
        highlights: w.highlights.map((h) =>
          h.id === 'h-zatca'
            ? {
                ...h,
                depth: 'ai_assisted' as const,
                interviewReady: false,
                domainReady: true,
                alternates: [{ id: 'w-d', text: 'Designed the ZATCA e-invoicing clearance flow for 3 Saudi merchants.', source: 'user' as const }],
              }
            : h,
        ),
      })),
    }
    const derived = deriveMasterCv(profile)!
    const bullets = derived.cv.experience[0]!.bullets
    expect(bullets).toContain('Designed the ZATCA e-invoicing clearance flow for 3 Saudi merchants.')
    expect(bullets.join(' ')).not.toContain('Integrated ZATCA')
    expect(derived.sources.experience[0]![2]).toEqual({ highlightId: 'h-zatca', wordingId: 'w-d' })
  })
})

describe('applyMasterCvEdit (CV Score autofix → profile)', () => {
  it('rewrites the source highlight and adds new skills as own', () => {
    const p = syntheticProfile()
    const cv = toMasterCv(p)!
    const edited: MasterCV = {
      ...cv,
      experience: cv.experience.map((e, i) =>
        i === 0 ? { ...e, bullets: e.bullets.map((b, j) => (j === 1 ? 'Migrated the double-entry ledger to PostgreSQL, cutting reconciliation errors by 85%.' : b)) } : e,
      ),
      skills: { ...cv.skills, secondary: [...(cv.skills.secondary ?? []), 'Kafka'] },
    }
    const next = applyMasterCvEdit(p, edited, counter())
    expect(next.work[0]!.highlights[1]).toMatchObject({ id: 'h-ledger', text: 'Migrated the double-entry ledger to PostgreSQL, cutting reconciliation errors by 85%.' })
    expect(next.skills.at(-1)).toMatchObject({ name: 'Other', skills: [{ name: 'Kafka', depth: 'own', interviewReady: true }] })
    expect(p.work[0]!.highlights[1]!.text).toContain('Led the double-entry')
  })
})

describe('applyMasterCvEdit keeps what the CV never showed', () => {
  it('a full MasterCV save cannot delete not-ready items, and removed bullets go', () => {
    const base = syntheticProfile()
    const profile: ResumeProfile = {
      ...base,
      projects: [...base.projects, projectSchema.parse({ id: 'pr-vibe', name: 'Vibe Wallet', depth: 'ai_assisted', highlights: [{ id: 'h-v', text: 'Wallet.' }] })],
    }
    const cv = toMasterCv(profile)!
    const edited: MasterCV = {
      ...cv,
      summary: 'New pitch.',
      experience: [{ ...cv.experience[0]!, bullets: cv.experience[0]!.bullets.slice(0, 1) }, cv.experience[1]!],
      projects: [],
    }
    const next = applyMasterCvEdit(profile, edited, counter())
    expect(next.basics.summary).toBe('New pitch.')
    expect(next.work[0]!.highlights.map((h) => h.id)).toEqual(['h-payouts'])
    expect(next.projects.map((p) => p.id)).toEqual(['pr-vibe'])
  })
})

describe('role suggestions ignore evidence that only not-ready items carry', () => {
  function withEinvoicing(depth: 'own' | 'ai_assisted'): ResumeProfile {
    const p = syntheticProfile()
    return {
      ...p,
      work: p.work.map((w) => ({ ...w, highlights: w.highlights.filter((h) => h.id !== 'h-zatca') })),
      projects: [
        projectSchema.parse({
          id: 'pr-einv',
          name: 'E-invoicing hub',
          description: 'Fatoora e-invoicing gateway',
          keywords: ['ZATCA', 'XAdES', 'UBL'],
          depth,
          highlights: [{ id: 'h-e1', text: 'Signed ZATCA e-invoices with XAdES and cleared them through Fatoora.', depth }],
        }),
      ],
    }
  }
  const PROFILE = { headline: null, summaryMd: null, careerNarrativeMd: null, skills: [], industries: [], roleTypes: [], yearsExperience: 3, stackWeights: {}, dismissedRoleSuggestions: [] }

  it('suggests e-invoicing when the evidence is ready, not when it is AI-assisted', () => {
    const families = (depth: 'own' | 'ai_assisted') =>
      suggestRoles({ profile: PROFILE, masterCv: toMasterCv(withEinvoicing(depth)) }).suggestions.map((s) => s.family)
    expect(families('own')).toContain('einvoicing')
    expect(families('ai_assisted')).not.toContain('einvoicing')
  })

  it('domain-only evidence (design wording) still counts', () => {
    const p = withEinvoicing('ai_assisted')
    const domain: ResumeProfile = {
      ...p,
      projects: p.projects.map((pr) => ({
        ...pr,
        domainReady: true,
        highlights: pr.highlights.map((h) => ({
          ...h,
          domainReady: true,
          alternates: [{ id: 'w-x', text: 'Designed ZATCA e-invoicing signing with XAdES and Fatoora clearance.', source: 'user' as const }],
        })),
      })),
    }
    const fams = suggestRoles({ profile: PROFILE, masterCv: toMasterCv(domain) }).suggestions.map((s) => s.family)
    expect(fams).toContain('einvoicing')
  })
})
