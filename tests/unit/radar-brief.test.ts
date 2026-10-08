import { describe, expect, it } from 'vitest'
import { filterCitations, normalizeQuote, quoteFound } from '@/lib/radar/brief/citations'
import { applyRemovals, countSentences } from '@/lib/radar/brief/confirm'
import { buildModule, briefIdOfCard, cardId } from '@/lib/radar/brief/module'
import { MIN_PRIMARY_SOURCES, primaryCandidates, type ItemRef } from '@/lib/radar/brief/primary'
import { robotsAllows } from '@/lib/radar/brief/robots'
import { signDraft, stableStringify, verifyDraft } from '@/lib/radar/brief/sign'
import { computeTimeline, type TimelineItem } from '@/lib/radar/brief/timeline'
import { emptySections } from '@/lib/radar/brief/types'

const SOURCE = 'Zorb is a compact decision model. It runs on a laptop with “four bits” of weights — no GPU needed.'
const texts = new Map([
  ['S1', SOURCE],
  ['S2', 'The Zorb repository ships a server that exposes one HTTP endpoint for predictions.'],
])

describe('verbatim citation filter', () => {
  it('keeps sentences whose quote is in the cited source, ignoring whitespace and quote style', () => {
    expect(quoteFound('It runs on a laptop with "four bits"', SOURCE)).toBe(true)
    expect(quoteFound('It runs on a  laptop\nwith', SOURCE)).toBe(true)
    expect(normalizeQuote('a — b')).toBe('a - b')
  })

  it('rejects paraphrases, case changes, short quotes and unknown sources', () => {
    expect(quoteFound('It runs on a notebook computer', SOURCE)).toBe(false)
    expect(quoteFound('zorb is a compact decision model', SOURCE)).toBe(false)
    expect(quoteFound('Zorb is a', SOURCE)).toBe(false)
  })

  it('drops failing sentences and caps each section', () => {
    const good = { text: 'Zorb is a compact model.', quote: 'Zorb is a compact decision model', source: 'S1' }
    const r = filterCitations(
      {
        what: [good, { text: 'Invented.', quote: 'a sentence in no source', source: 'S1' }, { ...good, source: 'S9' }],
        workflow: [{ text: 'One endpoint.', quote: 'exposes one HTTP endpoint for predictions', source: 'S2' }],
        security: Array.from({ length: 6 }, () => good),
        bogus: [good],
      },
      texts,
    )
    expect(r.sections.what).toEqual([good])
    expect(r.sections.workflow).toHaveLength(1)
    expect(r.sections.security).toHaveLength(4)
    expect(r.kept).toBe(6)
    expect(r.dropped).toBe(4)
  })

  it('drops sentences without text', () => {
    const r = filterCitations({ what: [{ text: ' ', quote: 'Zorb is a compact decision model', source: 'S1' }] }, texts)
    expect(r.kept).toBe(0)
  })
})

describe('computed timeline', () => {
  const at = (d: string): Date => new Date(`${d}T12:00:00Z`)
  const items: TimelineItem[] = [
    { source: 'hn', kind: 'news', url: 'https://news.ycombinator.com/item?id=2', publishedAt: at('2026-10-05'), fetchedAt: at('2026-10-06'), metrics: {} },
    { source: 'hn', kind: 'news', url: 'https://news.ycombinator.com/item?id=1', publishedAt: at('2026-10-04'), fetchedAt: at('2026-10-06'), metrics: {} },
    { source: 'github', kind: 'repo', url: 'https://github.com/acme/zorb', publishedAt: at('2026-09-19'), fetchedAt: at('2026-10-06'), metrics: { createdAt: '2026-09-18', repoId: 'acme/zorb' } },
    { source: 'hf', kind: 'model', url: 'https://huggingface.co/acme/zorb', publishedAt: null, fetchedAt: at('2026-10-06'), metrics: { createdAt: '2026-09-19' } },
    { source: 'feeds', kind: 'product', url: 'https://openai.com/x', publishedAt: at('2026-09-15'), fetchedAt: at('2026-10-06'), metrics: { feedId: 'openai' } },
    { source: 'gdelt', kind: 'news', url: 'https://n.example.com/a', publishedAt: null, fetchedAt: at('2026-10-07'), metrics: {} },
    { source: 'github', kind: 'repo', url: 'https://github.com/x/y', publishedAt: null, fetchedAt: at('2026-10-06'), metrics: {} },
  ]

  it('lists the earliest fact per kind, oldest first, from metadata only', () => {
    expect(computeTimeline(items)).toEqual([
      { date: '2026-09-15', label: 'Announced on OpenAI News', url: 'https://openai.com/x' },
      { date: '2026-09-18', label: 'Repository created (acme/zorb)', url: 'https://github.com/acme/zorb' },
      { date: '2026-09-19', label: 'Hugging Face model created', url: 'https://huggingface.co/acme/zorb' },
      { date: '2026-10-04', label: 'First Hacker News story', url: 'https://news.ycombinator.com/item?id=1' },
      { date: '2026-10-07', label: 'First news report', url: 'https://n.example.com/a' },
    ])
  })

  it('is empty without dated facts', () => {
    expect(computeTimeline([])).toEqual([])
  })
})

describe('primary sources and the brief gate', () => {
  const base: ItemRef = { source: 'hn', kind: 'news', title: 'T', url: 'https://news.ycombinator.com/item?id=1', excerpt: '', metrics: {} }

  it('takes only official URLs from the entry items: posts, READMEs, model cards, abstracts', () => {
    const c = primaryCandidates([
      { ...base, metrics: { links: ['https://github.com/acme/zorb'] } },
      { ...base, source: 'gdelt', url: 'https://news.example.com/zorb' },
      { ...base, source: 'feeds', kind: 'product', url: 'https://openai.com/index/zorb/' },
      { ...base, source: 'hf', kind: 'model', url: 'https://huggingface.co/acme/Zorb-7B', metrics: { repoId: 'acme/Zorb-7B' } },
      { ...base, source: 'arxiv', kind: 'paper', url: 'https://arxiv.org/abs/2601.00001', metrics: { arxivId: '2601.00001' } },
      { ...base, source: 'github', kind: 'repo', url: 'https://github.com/acme/zorb' },
    ])
    expect(c.map((x) => [x.kind, x.fetchUrl])).toEqual([
      ['official_post', 'https://openai.com/index/zorb/'],
      ['repo_readme', 'https://raw.githubusercontent.com/acme/zorb/HEAD/README.md'],
      ['model_card', 'https://huggingface.co/acme/Zorb-7B/raw/main/README.md'],
      ['paper_abstract', 'https://arxiv.org/abs/2601.00001'],
    ])
  })

  it('finds fewer than the minimum for news-only entries (no brief)', () => {
    const c = primaryCandidates([base, { ...base, source: 'gdelt', url: 'https://news.example.com/a' }])
    expect(c.length).toBeLessThan(MIN_PRIMARY_SOURCES)
  })

  it('does not treat a feed item on a non-official host as an official post', () => {
    expect(primaryCandidates([{ ...base, source: 'feeds', url: 'https://elsewhere.example.com/p' }])).toEqual([])
  })
})

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\n\nUser-agent: other\nDisallow: /`
  it('applies the longest matching rule for the * group', () => {
    expect(robotsAllows(txt, '/blog/post')).toBe(true)
    expect(robotsAllows(txt, '/private/x')).toBe(false)
    expect(robotsAllows(txt, '/private/ok/1')).toBe(true)
    expect(robotsAllows(txt, '/a/b.pdf')).toBe(false)
    expect(robotsAllows(txt, '/a/b.pdf?x')).toBe(true)
  })
  it('prefers a group for our own token and treats an empty file as allow-all', () => {
    expect(robotsAllows('User-agent: lee\nDisallow: /\n\nUser-agent: *\nAllow: /', '/x')).toBe(false)
    expect(robotsAllows('', '/x')).toBe(true)
    expect(robotsAllows('User-agent: *\nDisallow:', '/x')).toBe(true)
  })
})

describe('confirm and Learn this', () => {
  const sections = { ...emptySections(), what: [{ text: 'A.', quote: 'q', source: 'S1' }, { text: 'B.', quote: 'q', source: 'S1' }], security: [{ text: 'C.', quote: 'q', source: 'S2' }] }

  it('removes only the sentences the user dropped', () => {
    const kept = applyRemovals(sections, [{ section: 'what', index: 0 }])
    expect(kept.what.map((s) => s.text)).toEqual(['B.'])
    expect(countSentences(kept)).toBe(2)
  })

  it('signs drafts so a tampered draft is rejected', () => {
    const d = signDraft({ entryId: 'e', sections, sources: [], timeline: [], promptVersion: '1', promptHash: 'h', dropped: 0 })
    expect(verifyDraft(d)).toBe(true)
    expect(verifyDraft({ ...d, sections: { ...sections, what: [{ text: 'Edited.', quote: 'q', source: 'S1' }] } })).toBe(false)
    expect(verifyDraft({ ...d, signature: 'nope' })).toBe(false)
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
  })

  it('turns filled sections into cards, with a lab for models', () => {
    const id = '0f0e0d0c-0b0a-4090-8070-605040302010'
    const m = buildModule(id, { name: 'Zorb', kind: 'model' }, sections, new Date('2026-10-08T00:00:00Z'))
    expect(m.cards.map((c) => [c.id, c.front, c.back])).toEqual([
      [cardId(id, 'what'), 'What is Zorb?', 'A. B.'],
      [cardId(id, 'security'), 'What security point should you know about Zorb?', 'C.'],
    ])
    expect(m.lab?.href).toBe('/playground/models')
    expect(buildModule(id, { name: 'Zorb', kind: 'paper' }, sections, new Date()).lab).toBeNull()
    expect(briefIdOfCard(cardId(id, 'what'))).toBe(id)
  })
})
