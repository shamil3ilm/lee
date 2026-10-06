import { describe, expect, it } from 'vitest'
import { parseResumeProfile, type ResumeProfileInput } from '@/lib/resume/types'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { placeFromProfile } from '@/lib/academy/placement/seed'
import { readySuggestions } from '@/lib/academy/placement/study'

// Synthetic profiles only (no personal data).
const content = loadAcademyContent()
const graph = content.graph

function profile(input: ResumeProfileInput) {
  return parseResumeProfile(input)
}

function project(id: string, name: string, keywords: string[], flags: Record<string, unknown> = {}) {
  return { id, name, keywords, ...flags }
}

describe('placement seeds from readiness flags', () => {
  it('seeds an interview-ready (own) item at Competent and explains it', () => {
    const p = profile({ projects: [project('pr-cert', 'Cert-Ed', ['Go'])] })
    const { seeds } = placeFromProfile(p, graph)
    const go = seeds.find((s) => s.skillId === 'go')
    expect(go?.level).toBe(3)
    expect(go?.explanation).toBe('Seeded at Competent from: Cert-Ed (own)')
  })

  it('never seeds from AI-assisted work, even when it is domain-ready', () => {
    const p = profile({
      projects: [
        project('pr-dns', 'Toy DNS server', ['Go', 'DNS'], { depth: 'ai_assisted', domainReady: true, interviewReady: false }),
      ],
    })
    const { seeds, studyTargets } = placeFromProfile(p, graph)
    expect(seeds.find((s) => s.skillId === 'go')).toBeUndefined()
    expect(seeds.find((s) => s.skillId === 'dns')).toBeUndefined()
    // …it becomes a study target instead.
    expect(studyTargets.map((t) => t.skillId).sort()).toEqual(['dns', 'go'])
    expect(studyTargets[0]?.depth).toBe('ai_assisted')
  })

  it('AI-assisted evidence never raises a rating that own evidence set', () => {
    const own = profile({ skills: [{ id: 'g1', name: 'Languages', skills: [{ id: 'sk-go', name: 'Go' }] }] })
    const withAi = profile({
      skills: [{ id: 'g1', name: 'Languages', skills: [{ id: 'sk-go', name: 'Go' }] }],
      projects: [
        project('pr-a', 'Mail server', ['Go', 'SMTP'], { depth: 'ai_assisted', domainReady: true, interviewReady: false }),
        project('pr-b', 'Ledger bot', ['Go'], { depth: 'learning' }),
      ],
    })
    const a = placeFromProfile(own, graph).seeds.find((s) => s.skillId === 'go')
    const b = placeFromProfile(withAi, graph).seeds.find((s) => s.skillId === 'go')
    expect(a).toBeDefined()
    expect(b?.rating).toBe(a?.rating)
    expect(b?.sources.map((s) => s.label)).toEqual(['Go'])
  })

  it('counts an AI-assisted item the user marked interview-ready (their decision)', () => {
    const p = profile({
      projects: [project('pr-r', 'Edge cache', ['Rust'], { depth: 'ai_assisted', interviewReady: true })],
    })
    const rust = placeFromProfile(p, graph).seeds.find((s) => s.skillId === 'rust')
    expect(rust?.level).toBe(3)
    expect(rust?.explanation).toBe('Seeded at Competent from: Edge cache (AI-assisted, marked interview-ready)')
  })

  it('seeds own domain-ready-only evidence lower, at Beginner', () => {
    const p = profile({
      work: [
        {
          id: 'w-1',
          name: 'Example Payments',
          position: 'Engineer',
          highlights: [{ id: 'h-1', text: 'Designed the rate limiting policy for partner APIs.', interviewReady: false, domainReady: true }],
        },
      ],
    })
    const seed = placeFromProfile(p, graph).seeds.find((s) => s.skillId === 'rate-limiting')
    expect(seed?.level).toBe(2)
    expect(seed?.explanation).toBe('Seeded at Beginner from: Example Payments (own, domain only)')
  })

  it('uses work keywords only when the job has an interview-ready highlight', () => {
    const notReady = profile({
      work: [
        {
          id: 'w-1',
          name: 'Example Co',
          position: 'Engineer',
          keywords: ['Kafka'],
          highlights: [{ id: 'h-1', text: 'Shipped things.', depth: 'learning' }],
        },
      ],
    })
    expect(placeFromProfile(notReady, graph).seeds.find((s) => s.skillId === 'queues-messaging')).toBeUndefined()
    const ready = profile({
      work: [{ id: 'w-1', name: 'Example Co', position: 'Engineer', keywords: ['Kafka'], highlights: [{ id: 'h-1', text: 'Shipped things.' }] }],
    })
    expect(placeFromProfile(ready, graph).seeds.find((s) => s.skillId === 'queues-messaging')?.level).toBe(3)
  })

  it('more independent sources raise confidence (lower deviation), still Competent', () => {
    const one = profile({ projects: [project('p1', 'Alpha', ['PostgreSQL'])] })
    const three = profile({
      projects: [project('p1', 'Alpha', ['PostgreSQL']), project('p2', 'Beta', ['PostgreSQL']), project('p3', 'Gamma', ['SQL'])],
    })
    const a = placeFromProfile(one, graph).seeds.find((s) => s.skillId === 'sql-querying')
    const b = placeFromProfile(three, graph).seeds.find((s) => s.skillId === 'sql-querying')
    expect(b!.deviation).toBeLessThan(a!.deviation)
    expect(b!.level).toBe(3)
    expect(b!.explanation).toBe('Seeded at Competent from: Alpha (own), Beta (own), Gamma (own)')
  })

  it('is empty for an empty profile', () => {
    const r = placeFromProfile(profile({}), graph)
    expect(r.seeds).toEqual([])
    expect(r.studyTargets).toEqual([])
  })
})

describe('study list → study targets', () => {
  it('maps study items (ai_assisted and learning) to skills with notes and target dates', () => {
    const p = profile({
      skills: [
        {
          id: 'g1',
          name: 'Learning',
          skills: [
            { id: 'sk-rust', name: 'Rust', depth: 'learning', studyTarget: '2026-11-01', studyNotes: 'Ownership chapter' },
            { id: 'sk-dkim', name: 'DKIM', depth: 'ai_assisted', studyTarget: '2026-10-15' },
            { id: 'sk-odd', name: 'Basket weaving', depth: 'learning' },
          ],
        },
      ],
    })
    const { studyTargets, unmappedStudy } = placeFromProfile(p, graph)
    expect(studyTargets.map((t) => [t.skillId, t.targetDate])).toEqual([
      ['rust', '2026-11-01'],
      ['email-delivery', '2026-10-15'],
    ])
    expect(studyTargets[0]?.notes).toBe('Ownership chapter')
    expect(unmappedStudy.map((u) => u.label)).toEqual(['Basket weaving'])
  })

  it('drops items the user already marked interview-ready', () => {
    const p = profile({
      skills: [{ id: 'g1', name: 'L', skills: [{ id: 'sk-go', name: 'Go', depth: 'learning', interviewReady: true }] }],
    })
    expect(placeFromProfile(p, graph).studyTargets).toEqual([])
  })

  it('suggests (never sets) interview-ready once the skill reaches Competent', () => {
    const p = profile({
      skills: [{ id: 'g1', name: 'L', skills: [{ id: 'sk-go', name: 'Go', depth: 'learning' }, { id: 'sk-rust', name: 'Rust', depth: 'learning' }] }],
    })
    const { studyTargets } = placeFromProfile(p, graph)
    const levels = new Map([
      ['go', 3],
      ['rust', 2],
    ])
    const suggestions = readySuggestions(studyTargets, levels)
    expect(suggestions).toEqual([
      expect.objectContaining({ studyItemId: 'sk-go', skillId: 'go', label: 'Go' }),
    ])
    expect(suggestions[0]?.message).toMatch(/Competent in Go/)
    // The profile itself is untouched.
    expect(p.skills[0]?.skills[0]?.interviewReady).toBe(false)
  })
})
