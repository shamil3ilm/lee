import { describe, expect, it } from 'vitest'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { lockAiWordings, offeredBullets, checkWordingSignal, wordingRequest } from '@/lib/cv-fit/tailor/ai'
import { applySuggestions } from '@/lib/cv-fit/tailor/apply'
import { diffResumes, sameResume } from '@/lib/cv-fit/tailor/diff'
import { planTailoring, previewTailoring, withAiWordings, type TailorInput } from '@/lib/cv-fit/tailor/plan'
import { factsText, supportedKeywords } from '@/lib/cv-fit/tailor/summary'
import { profileUnits } from '@/lib/cv-fit/tailor/units'
import { checkDomainWording, checkFactLock } from '@/lib/resume/fact-lock'
import { renderVariant } from '@/lib/variants/render'
import { tailorProfile, tailorRecipe, TAILOR_JD } from '@/tests/fixtures/resume/tailor'

const NOW = new Date('2026-10-08T09:00:00Z')

function input(over: Partial<TailorInput> = {}): TailorInput {
  return { profile: tailorProfile(), recipe: tailorRecipe(), job: TAILOR_JD, years: 4, graph: loadAcademyContent().graph, ...over }
}

describe('requirement checklist', () => {
  const plan = planTailoring(input())
  const by = (needle: string) => plan.checklist.find((c) => c.text.includes(needle))!

  it('marks each must-have and nice-to-have met / partial / missing with its evidence', () => {
    expect(by('PHP and Laravel')).toMatchObject({ weight: 'must', status: 'met', inCv: 'met', source: { kind: 'highlight', id: 'h-hooks' } })
    expect(by('PostgreSQL')).toMatchObject({ status: 'partial', inCv: 'missing', source: { id: 'h-sql' } })
    expect(by('Kubernetes')).toMatchObject({ status: 'missing' })
    expect(by('Kubernetes').source).toBeUndefined()
    expect(by('React')).toMatchObject({ weight: 'nice', status: 'met' })
  })

  it('never counts a learning item as evidence', () => {
    // "Wrote Kubernetes manifests" and the Kubernetes skill are learning items.
    expect(by('Kubernetes').evidence).toBeUndefined()
    expect(profileUnits(tailorProfile()).some((u) => u.ref.id === 'h-k8s' || u.ref.id === 'sk-k8s')).toBe(false)
  })
})

describe('suggestions per status', () => {
  const plan = planTailoring(input())
  const kinds = plan.suggestions.map((s) => s.id)

  it('met: lead with the evidence, reorder skills, swap to an approved wording', () => {
    expect(kinds).toContain('lead:h-hooks')
    expect(kinds).toContain('lead:skills')
    const swap = plan.suggestions.find((s) => s.kind === 'swap_wording')!
    expect(swap).toMatchObject({ highlightId: 'h-hooks', wordingId: 'w-hooks-idem' })
    expect(swap.requirementIds.length).toBeGreaterThan(0)
  })

  it('partial: include the ready line that shows the overlap, and the related ready skill', () => {
    expect(kinds).toContain('include:highlight:h-sql')
    const skill = plan.suggestions.find((s) => s.id === 'include:skill:sk-mysql')!
    expect(skill.reason).toMatch(/^Related ready skill/)
  })

  it('missing: a gap with options, never a suggestion', () => {
    const missing = plan.checklist.filter((c) => c.status === 'missing').map((c) => c.id)
    expect(missing.length).toBe(2)
    for (const s of plan.suggestions) {
      if (s.kind === 'headline' || s.kind === 'summary') continue
      for (const id of s.requirementIds) expect(missing).not.toContain(id)
    }
    const k8s = plan.gaps.find((g) => g.studyLabel === 'Kubernetes')!
    expect(k8s.adjacent).toBeNull()
    const kafka = plan.gaps.find((g) => g.studyLabel === 'Kafka')!
    expect(kafka.playground).toContain('Queues & messaging')
    expect(kafka.adjacent?.source).toMatchObject({ kind: 'highlight', id: 'h-hooks' })
  })

  it('headline and summary use only keywords fully ready work supports', () => {
    const keywords = supportedKeywords(plan.checklist, profileUnits(tailorProfile()))
    expect(keywords).toEqual(expect.arrayContaining(['PHP', 'Laravel', 'React']))
    expect(keywords).not.toContain('PostgreSQL')
    expect(keywords).not.toContain('Kubernetes')
    const headline = plan.suggestions.find((s) => s.kind === 'headline')!
    expect(headline.text.startsWith('Backend Engineer · ')).toBe(true)
  })
})

describe('the fact lock on every suggested wording', () => {
  it('every text a suggestion would print passes the number and domain locks', () => {
    const profile = tailorProfile()
    const plan = planTailoring(input())
    const facts = factsText(profile)
    for (const s of plan.suggestions) {
      if (s.kind === 'swap_wording' || s.kind === 'ai_wording') {
        const master = [...profile.work, ...profile.projects].flatMap((i) => i.highlights).find((h) => h.id === s.highlightId)!
        expect(checkFactLock(s.text, master.text).ok).toBe(true)
      }
      if (s.kind === 'headline' || s.kind === 'summary') {
        expect(checkFactLock(s.text, facts).ok).toBe(true)
        expect(checkDomainWording(s.text).ok).toBe(true)
      }
    }
  })

  it('AI wordings: numbers must exist in the master, design-only items cannot claim implementation', () => {
    const profile = tailorProfile()
    const plan = planTailoring(input())
    const bullets = offeredBullets(profile, tailorRecipe(), plan.checklist)
    expect(bullets.map((b) => b.highlightId)).toContain('h-hooks')
    expect(checkWordingSignal(bullets, plan.jd).ok).toBe(true)
    expect(checkWordingSignal([], plan.jd)).toMatchObject({ ok: false, code: 'tailor_no_bullets' })
    expect(wordingRequest(profile, bullets, plan.jd).terms).toEqual(expect.arrayContaining(['PHP', 'Laravel']))
    const domainBullet = { highlightId: 'h-zatca', text: 'Designed the ZATCA e-invoicing clearance flow.', requirementIds: [] }
    const locked = lockAiWordings(profile, [...bullets, domainBullet], {
      rewrites: [
        { id: 'h-hooks', text: 'Built idempotent payment webhooks in PHP and Laravel handling 3M events per day.' },
        { id: 'h-hooks', text: 'Built idempotent payment webhooks in PHP and Laravel handling 2M events per day.' },
        { id: 'h-zatca', text: 'Implemented the ZATCA e-invoicing clearance flow in PHP.' },
        { id: 'h-unknown', text: 'Anything at all.' },
      ],
    }, plan.jd)
    expect(locked.suggestions).toHaveLength(1)
    expect(locked.suggestions[0]).toMatchObject({ kind: 'ai_wording', highlightId: 'h-hooks' })
    expect(locked.rejected.map((r) => r.reason)).toEqual([
      'Numbers not in the original: 3m',
      'Design-only item claims implementation: implemented',
    ])
  })

  it('an accepted AI wording joins the master highlight as an approved alternate', () => {
    const plan = planTailoring(input())
    const ai = lockAiWordings(tailorProfile(), offeredBullets(tailorProfile(), tailorRecipe(), plan.checklist), {
      rewrites: [{ id: 'h-hooks', text: 'Built idempotent payment webhooks in PHP and Laravel handling 2M events per day.' }],
    }, plan.jd).suggestions
    const withAi = planTailoring(input({ aiWordings: ai }))
    const { profile, wordingIds } = withAiWordings(tailorProfile(), ai, () => 'w-new')
    expect(wordingIds.get('h-hooks')).toBe('w-new')
    const h = profile.work[0]!.highlights.find((x) => x.id === 'h-hooks')!
    expect(h.alternates.find((a) => a.id === 'w-new')).toMatchObject({ source: 'ai' })
    const accepted = ai[0]!
    if (accepted.kind !== 'ai_wording') throw new Error('expected an AI wording')
    const preview = previewTailoring(input(), withAi, [accepted.id], { now: NOW, makeId: () => 'w-new' })
    expect(preview.rendered.sections.find((s) => s.key === 'work')!.entries[0]!.bullets.map((b) => b.text)).toContain(accepted.text)
  })
})

/** Tiny deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ASKS = ['PHP', 'Laravel', 'PostgreSQL', 'MySQL', 'Kubernetes', 'Kafka', 'React', 'Terraform', 'Go', 'Redis', 'AWS', 'GraphQL', 'Docker']

describe('missing requirements are never added (property)', () => {
  it('holds for 120 random JDs and readiness mixes', () => {
    const random = rng(17)
    for (let run = 0; run < 120; run++) {
      const base = tailorProfile()
      // Randomly un-ready some highlights and skills.
      const profile = {
        ...base,
        work: base.work.map((w) => ({
          ...w,
          highlights: w.highlights.map((h) => (random() < 0.3 ? { ...h, depth: 'learning' as const, interviewReady: false, domainReady: false } : h)),
        })),
        skills: base.skills.map((g) => ({ ...g, skills: g.skills.map((s) => (random() < 0.3 ? { ...s, depth: 'learning' as const, interviewReady: false, domainReady: false } : s)) })),
      }
      const asks = ASKS.filter(() => random() < 0.35)
      const job = { ...TAILOR_JD, descriptionMd: ['## Requirements', ...asks.map((a) => `- Strong ${a} experience.`)].join('\n') }
      const inp = input({ profile, job })
      const plan = planTailoring(inp)
      const preview = previewTailoring(inp, plan, plan.suggestions.map((s) => s.id), { now: NOW })
      const units = profileUnits(profile)
      const allowed = new Set(units.map((u) => u.text))
      for (const h of profile.work.flatMap((w) => w.highlights)) for (const a of h.alternates) allowed.add(a.text)
      // 1. Every missing requirement is still missing on the tailored CV.
      for (const c of preview.checklist) if (c.status === 'missing') expect(c.inCv).toBe('missing')
      // 2. Every printed bullet is presentable profile content.
      for (const s of preview.rendered.sections) for (const e of s.entries) for (const b of e.bullets) expect(allowed.has(b.text)).toBe(true)
      // 3. No unready item and no unbacked skill reaches the CV.
      const skillLine = preview.rendered.sections.find((s) => s.key === 'skills')?.lines[0] ?? ''
      for (const g of profile.skills) for (const s of g.skills) if (!units.some((u) => u.ref.id === s.id)) expect(skillLine.split(', ')).not.toContain(s.name)
    }
  })
})

describe('trim to the page target', () => {
  it('drops the lowest-relevance lines until it fits, keeping the evidence', () => {
    const base = tailorProfile()
    const filler = Array.from({ length: 22 }, (_, i) => ({
      id: `h-fill-${i}`,
      text: `Maintained internal tooling module number ${i + 1} for the office, kept documentation tidy and answered colleague questions every week.`,
      alternates: [],
      visibility: {},
      depth: 'own' as const,
      interviewReady: true,
      domainReady: true,
      ownedAspects: '',
      studyNotes: '',
      studyTarget: '',
    }))
    const profile = { ...base, work: base.work.map((w, i) => (i === 0 ? { ...w, highlights: [...w.highlights, ...filler] } : w)) }
    const recipe = tailorRecipe({
      region: 'remote',
      lengthTarget: 1,
      work: [
        { id: 'w-pay', highlights: [{ id: 'h-recon', wordingId: null }, { id: 'h-hooks', wordingId: null }, ...filler.map((f) => ({ id: f.id, wordingId: null }))] },
        { id: 'w-shop', highlights: [{ id: 'h-react', wordingId: null }] },
      ],
    })
    expect(renderVariant(profile, recipe).estimatedPages).toBeGreaterThan(1.15)
    const inp = input({ profile, recipe })
    const plan = planTailoring(inp)
    const trim = plan.suggestions.find((s) => s.kind === 'trim')
    expect(trim).toBeDefined()
    if (trim?.kind !== 'trim') return
    expect(trim.target).toBe(1)
    expect(trim.drops.every((d) => d.ref.id.startsWith('h-fill'))).toBe(true)
    const preview = previewTailoring(inp, plan, ['trim'], { now: NOW })
    expect(preview.pagesAfter).toBeLessThanOrEqual(1.15)
    const bullets = preview.rendered.sections.find((s) => s.key === 'work')!.entries.flatMap((e) => e.bullets.map((b) => b.text))
    expect(bullets).toContain('Built payment webhooks in Laravel handling 2M events per day.')
  })
})

describe('apply, preview and diff', () => {
  it('applies includes in profile order and rejects nothing silently', () => {
    const plan = planTailoring(input())
    const recipe = applySuggestions(tailorProfile(), tailorRecipe(), plan.suggestions.filter((s) => s.kind === 'include'))
    expect(recipe.work.map((w) => w.id)).toEqual(['w-pay', 'w-shop'])
    expect(recipe.work[1]!.highlights[0]!.id).toBe('h-sql')
    expect(recipe.skills[0]).toBe('sk-mysql')
  })

  it('shows coverage, CV Score and a diff before / after', () => {
    const plan = planTailoring(input())
    const none = previewTailoring(input(), plan, [], { now: NOW })
    expect(sameResume(none.diff)).toBe(true)
    expect(none.after).toEqual(none.before)
    const all = previewTailoring(input(), plan, plan.suggestions.map((s) => s.id), { now: NOW })
    expect(all.before).toMatchObject({ met: 2, partial: 0, missing: 3, total: 5 })
    expect(all.after.partial).toBe(1)
    expect(typeof all.scoreBefore).toBe('number')
    expect(typeof all.scoreAfter).toBe('number')
    const work = all.diff.find((d) => d.label === 'Experience')!
    expect(work.after.find((l) => l.text.includes('Tuned MySQL'))?.state).toBe('added')
    expect(work.before.find((l) => l.text.includes('Built payment webhooks'))?.state).toBe('removed')
  })

  it('diffResumes marks moved lines', () => {
    const profile = tailorProfile()
    const a = renderVariant(profile, tailorRecipe())
    const b = renderVariant(profile, tailorRecipe({ work: [{ id: 'w-pay', highlights: [{ id: 'h-hooks', wordingId: null }, { id: 'h-recon', wordingId: null }] }] }))
    const work = diffResumes(a, b).find((d) => d.label === 'Experience')!
    // The two bullets swapped places; the ShopCo job is gone.
    expect(work.after.map((l) => l.state)).toEqual(['same', 'moved', 'moved'])
    expect(work.before.filter((l) => l.state === 'removed').map((l) => l.text)).toEqual(['Software Engineer — ShopCo', '• Shipped a React checkout used by 4 storefronts.'])
  })
})
