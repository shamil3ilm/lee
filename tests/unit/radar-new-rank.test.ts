import { describe, expect, it } from 'vitest'
import { selectWhatsNewDigest, whatsNewInDigest, type NewDigestCandidate } from '@/lib/radar/new/digest'
import { mergeNewMetrics, joinPatch, newEntryValues } from '@/lib/radar/new/merge'
import { capForToday, isNewEntity, tractionScore } from '@/lib/radar/new/novelty'
import { cleanProjectIds, deriveReleaseProjects, unionProjects } from '@/lib/radar/new/projects'
import { rankEntry } from '@/lib/radar/new/rank'
import { buildRelevanceTopics, relevanceMatcher } from '@/lib/radar/new/relevance'
import type { NewItemInput } from '@/lib/radar/new/types'
import { collapseVariants } from '@/lib/radar/new/variants'

const NOW = new Date('2026-10-08T09:00:00Z')
const DAY = 86_400_000
const ago = (days: number): Date => new Date(NOW.getTime() - days * DAY)

function model(id: string, over: Partial<NewItemInput> = {}, metrics: NewItemInput['metrics'] = {}): NewItemInput {
  return {
    source: 'hf',
    externalId: `model:${id}`,
    kind: 'model',
    title: id,
    url: `https://huggingface.co/${id}`,
    publishedAt: ago(3),
    excerpt: '',
    category: 'model',
    openness: 'open',
    group: 'llm',
    entityKey: `hf:model:${id.toLowerCase()}`,
    createdAt: ago(3),
    tags: [],
    traction: 0.5,
    metrics: { repoId: id, likes: 50, ...metrics },
    ...over,
  }
}

describe('novelty detector', () => {
  it('is new the first time, inside the source window', () => {
    expect(isNewEntity({ known: false, createdAt: ago(3), source: 'hf', now: NOW })).toBe(true)
    expect(isNewEntity({ known: true, createdAt: ago(3), source: 'hf', now: NOW })).toBe(false)
  })

  it('ignores old things that merely trend again', () => {
    expect(isNewEntity({ known: false, createdAt: ago(400), source: 'hf', now: NOW })).toBe(false)
    expect(isNewEntity({ known: false, createdAt: ago(20), source: 'hf', now: NOW })).toBe(false)
    expect(isNewEntity({ known: false, createdAt: ago(20), source: 'github', now: NOW })).toBe(true)
    expect(isNewEntity({ known: false, createdAt: new Date(NOW.getTime() + 5 * DAY), source: 'feeds', now: NOW })).toBe(false)
    expect(isNewEntity({ known: false, createdAt: null, source: 'feeds', now: NOW })).toBe(true)
  })

  it('scores early velocity, not lifetime totals', () => {
    // 300 stars in 2 days beats 900 stars in 30 days.
    expect(tractionScore('github', 300, ago(2), NOW)).toBeGreaterThan(tractionScore('github', 900, ago(30), NOW))
    expect(tractionScore('releases', undefined, null, NOW)).toBe(0.5)
    expect(tractionScore('hn', 10_000, ago(1), NOW)).toBe(1)
  })

  it('caps new rows per source per day, strongest first', () => {
    const items = [model('a/x', { traction: 0.2 }), model('a/y', { traction: 0.9 }), model('a/z', { traction: 0.5 })]
    expect(capForToday(items, 0, 2).map((i) => i.title)).toEqual(['a/y', 'a/z'])
    expect(capForToday(items, 2, 2)).toEqual([])
  })
})

describe('variant collapsing', () => {
  const base = model('acme/Zorb-27B')
  const gguf = model('quant/Zorb-27B-GGUF', {}, { baseModel: 'acme/Zorb-27B', baseRelation: 'quantized' })
  const chat = model('tuner/Zorb-27B-Chat', {}, { baseModel: 'acme/Zorb-27B', baseRelation: 'finetune' })
  const chatAwq = model('quant/Zorb-27B-Chat-AWQ', {}, { baseModel: 'tuner/Zorb-27B-Chat', baseRelation: 'quantized' })
  const oldQuant = model('quant/Old-8B-GGUF', {}, { baseModel: 'old/Old-8B', baseRelation: 'quantized' })
  const oldAdapter = model('lab/Pick-9B', {}, { baseModel: 'old/Old-8B', baseRelation: 'adapter' })

  it('folds quantisations and fine-tunes of a new base under it, following chains to the root', () => {
    const r = collapseVariants([gguf, chatAwq, base, chat, oldQuant, oldAdapter], new Map())
    expect(r.primaries.map((p) => p.title)).toEqual(['acme/Zorb-27B', 'lab/Pick-9B'])
    expect(r.variants.map((v) => [v.item.title, v.rootKey])).toEqual([
      ['quant/Zorb-27B-GGUF', 'hf:model:acme/zorb-27b'],
      ['quant/Zorb-27B-Chat-AWQ', 'hf:model:acme/zorb-27b'],
      ['tuner/Zorb-27B-Chat', 'hf:model:acme/zorb-27b'],
    ])
    // A GGUF of an older base is a repackaging, not new.
    expect(r.dropped).toBe(1)
  })

  it('folds under a base stored on an earlier day', () => {
    const r = collapseVariants([gguf], new Map([['hf:model:acme/zorb-27b', 'hf:model:acme/zorb-27b']]))
    expect(r.variants).toHaveLength(1)
    expect(r.primaries).toHaveLength(0)
  })
})

describe('entry merging', () => {
  it('keeps the best counts and the strongest category, and open wins', () => {
    expect(mergeNewMetrics({ stars: 10, license: 'MIT', links: ['https://a.example'] }, { stars: 30, license: 'X', points: 5, links: ['https://b.example'] })).toEqual({
      stars: 30,
      license: 'MIT',
      points: 5,
      links: ['https://a.example', 'https://b.example'],
    })
    const story: NewItemInput = { ...model('x/y'), source: 'hn', category: 'news', group: 'show', openness: null, entityKey: 'hn:1', name: 'Zorb', url: 'https://news.ycombinator.com/item?id=1' }
    const entry = { ...newEntryValues(story, NOW), createdAt: ago(2) }
    const patch = joinPatch(entry, model('acme/Zorb'), NOW)
    expect(patch).toMatchObject({ category: 'model', grp: 'llm', name: 'Zorb', openness: 'open', sources: ['hn', 'hf'] })
    expect(patch.createdAt?.getTime()).toBe(ago(3).getTime())
  })
})

describe('personal relevance and ranking', () => {
  const topics = buildRelevanceTopics({
    readySkills: ['Laravel', 'PHP', 'Go'],
    studySkills: ['Docker'],
    roleFamilies: ['payments', 'llm_app'],
    releaseProjects: ['laravel'],
  })
  const match = relevanceMatcher(topics)

  it('matches ready skills, study list, release list and role families on word boundaries', () => {
    const r = match({ name: 'ledgerly', excerpt: 'Payments ledger package for Laravel', tags: ['laravel', 'php'] })
    expect(r.chips.map((c) => `${c.label}/${c.reason}`)).toEqual(['Laravel/ready_skill', 'PHP/ready_skill', 'Payments/role_family'])
    expect(r.score).toBe(1)
    // The release list counts for releases only.
    const release = match({ category: 'release', name: 'Laravel 14', excerpt: '', tags: ['laravel'] })
    expect(release.chips.map((c) => c.reason)).toEqual(['ready_skill', 'stack'])
    // "Go" is too short to match prose ("go faster"), only an exact tag.
    expect(match({ name: 'speedy', excerpt: 'make builds go faster', tags: [] }).score).toBe(0)
    expect(match({ name: 'gopher', excerpt: '', tags: ['go'] }).chips[0]).toEqual({ label: 'Go', reason: 'ready_skill' })
    expect(match({ name: 'ragkit', excerpt: 'RAG for LLM agents', tags: [] }).chips[0]).toEqual({ label: 'LLM integration', reason: 'role_family' })
  })

  it('combines traction, corroboration, authority, relevance and freshness, with reason chips', () => {
    const base = { group: 'repo', createdAt: ago(2), firstSeenAt: ago(1) }
    const relevant = rankEntry({ ...base, sources: ['github', 'hn'], metrics: { stars: 400 } }, match({ name: 'x', excerpt: 'Laravel payments', tags: [] }), NOW)
    const plain = rankEntry({ ...base, sources: ['github'], metrics: { stars: 400 } }, { score: 0, chips: [] }, NOW)
    expect(relevant.score).toBeGreaterThan(plain.score)
    expect(relevant.chips.map((c) => c.label)).toEqual(['Laravel · ready skill', 'Payments · role family', '200 stars/day', 'On 2 sources', 'New this week'])
    const official = rankEntry({ group: null, sources: ['feeds'], metrics: {}, createdAt: ago(0.5), firstSeenAt: ago(0.5) }, { score: 0, chips: [] }, NOW)
    expect(official.chips.map((c) => c.label)).toEqual(['Official lab post', 'New today'])
    // An official post outranks an untested repo with no traction.
    const quiet = rankEntry({ group: 'repo', sources: ['github'], metrics: { stars: 1 }, createdAt: ago(0.5), firstSeenAt: ago(0.5) }, { score: 0, chips: [] }, NOW)
    expect(official.score).toBeGreaterThan(quiet.score)
  })
})

describe('release projects', () => {
  it('derives the list from skills, the study list and role families', () => {
    expect(deriveReleaseProjects({ readySkills: ['Laravel', 'PostgreSQL', 'Next.js'], studySkills: ['TypeScript'], roleFamilies: ['devops'] })).toEqual([
      'laravel',
      'nextjs',
      'typescript',
      'postgresql',
      'docker',
      'kubernetes',
    ])
    expect(cleanProjectIds(['laravel', 'laravel', 'nope', 3])).toEqual(['laravel'])
    expect(unionProjects([['php', 'laravel'], ['laravel'], ['nope']])).toEqual(['laravel', 'php'])
  })
})

describe("weekly What's new digest", () => {
  const c = (id: string, category: NewDigestCandidate['category'], score: number, seen = 2): NewDigestCandidate => ({
    id,
    name: id,
    category,
    url: `https://example.com/${id}`,
    score,
    reasons: ['r1', 'r2', 'r3'],
    firstSeenAt: ago(seen),
  })

  it('takes the top N per category seen this week, by the personal score', () => {
    const sections = selectWhatsNewDigest([c('m1', 'model', 50), c('m2', 'model', 80), c('m3', 'model', 70), c('m4', 'model', 60), c('old', 'model', 99, 10), c('p1', 'paper', 40)], {
      since: ago(7),
    })
    expect(sections.map((s) => s.label)).toEqual(['Models', 'Papers'])
    expect(sections[0]?.lines.map((l) => l.id)).toEqual(['m2', 'm3', 'm4'])
    expect(sections[0]?.lines[0]?.reasons).toEqual(['r1', 'r2'])
  })

  it('honours the notification mode', () => {
    expect(whatsNewInDigest('weekly')).toBe(true)
    expect(whatsNewInDigest('daily')).toBe(true)
    expect(whatsNewInDigest('off')).toBe(false)
  })
})
