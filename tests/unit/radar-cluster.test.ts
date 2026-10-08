import { describe, expect, it } from 'vitest'
import { clusterKeys, entryNameFor, mergeKeys, mergedKind, pickEntry } from '@/lib/radar/cluster'
import { arxivIdOf, canonicalUrl, excerptOf, normalizeName, plainText } from '@/lib/radar/text'
import type { RadarItemInput } from '@/lib/radar/types'

function item(over: Partial<RadarItemInput>): RadarItemInput {
  return {
    source: 'hn',
    externalId: 'x',
    kind: 'news',
    title: 'Something',
    url: 'https://news.ycombinator.com/item?id=1',
    publishedAt: null,
    excerpt: '',
    metrics: {},
    ...over,
  }
}

describe('radar text helpers', () => {
  it('canonicalises URLs', () => {
    expect(canonicalUrl('https://www.github.com/Acme/Widget/tree/main?x=1#y')).toBe('github.com/acme/widget')
    expect(canonicalUrl('https://huggingface.co/acme/widget-7b/blob/main/README.md')).toBe('huggingface.co/acme/widget-7b')
    expect(canonicalUrl('https://huggingface.co/spaces/acme/demo')).toBe('huggingface.co/spaces/acme/demo')
    expect(canonicalUrl('https://blog.example.com/posts/launch/?utm_source=x')).toBe('blog.example.com/posts/launch')
    expect(canonicalUrl('https://news.ycombinator.com/item?id=42&utm_medium=y')).toBe('news.ycombinator.com/item?id=42')
    expect(canonicalUrl('https://dev.example.com/?p=77')).toBe('dev.example.com?p=77')
    expect(canonicalUrl('ftp://x.example/a')).toBeNull()
    expect(canonicalUrl('not a url')).toBeNull()
  })

  it('extracts arXiv ids', () => {
    expect(arxivIdOf('https://arxiv.org/abs/2610.10538v2')).toBe('2610.10538')
    expect(arxivIdOf('https://huggingface.co/papers/2609.36995')).toBe('2609.36995')
    expect(arxivIdOf('2601.00001')).toBe('2601.00001')
    expect(arxivIdOf('https://example.com/2601.00001')).toBeNull()
  })

  it('makes capped excerpts without email addresses', () => {
    const e = excerptOf(`<p>Contact a.person@example.com &amp; read ${'x'.repeat(600)}</p>`)
    expect(e.length).toBeLessThanOrEqual(500)
    expect(e).toContain('[email]')
    expect(e).not.toContain('@example.com')
    expect(e.startsWith('Contact [email] & read')).toBe(true)
    expect(plainText('<![CDATA[<b>Hi</b>]]> &#39;there&#39;')).toBe("Hi 'there'")
  })

  it('normalises names', () => {
    expect(normalizeName('Widget-7B  v2!')).toBe('widget7bv2')
  })
})

describe('clustering', () => {
  it('derives strong keys from arXiv ids, URLs, links and repo names', () => {
    const keys = clusterKeys(
      item({
        source: 'hf_papers',
        kind: 'paper',
        url: 'https://huggingface.co/papers/2609.36995',
        metrics: { arxivId: '2609.36995', links: ['https://github.com/acme/salt'], repoId: 'acme/salt' },
      }),
      [],
    )
    expect(keys.strong).toEqual(
      expect.arrayContaining(['arxiv:2609.36995', 'url:github.com/acme/salt', 'name:salt']),
    )
    expect(keys.term).toEqual([])
  })

  it('ignores generic URLs such as a blog index', () => {
    const keys = clusterKeys(item({ url: 'https://example.com/blog' }), [])
    expect(keys.strong).toEqual([])
  })

  it('adds a term key only for an item matching exactly one term', () => {
    expect(clusterKeys(item({}), ['t1']).term).toEqual(['term:t1'])
    expect(clusterKeys(item({}), ['t1', 't2']).term).toEqual([])
  })

  it('dedups across sources: a story linking a repo joins the repo entry', () => {
    const repo = clusterKeys(
      item({ source: 'github', kind: 'repo', url: 'https://github.com/acme/zorb', metrics: { repoId: 'acme/zorb' } }),
      [],
    )
    const story = clusterKeys(item({ metrics: { links: ['https://github.com/acme/zorb'] } }), [])
    expect(pickEntry(story, [{ id: 'other', keys: ['url:x.example/a'] }, { id: 'repo', keys: repo.strong }])).toBe('repo')
  })

  it('prefers strong-key matches over term matches, then terms, then a new entry', () => {
    const k = { strong: ['url:a.example/x'], term: ['term:t1'] }
    expect(pickEntry(k, [{ id: 'byTerm', keys: ['term:t1'] }, { id: 'byUrl', keys: ['url:a.example/x'] }])).toBe('byUrl')
    expect(pickEntry({ strong: ['url:b.example/y'], term: ['term:t1'] }, [{ id: 'byTerm', keys: ['term:t1'] }])).toBe('byTerm')
    expect(pickEntry({ strong: ['url:c.example/z'], term: [] }, [{ id: 'byTerm', keys: ['term:t1'] }])).toBeNull()
  })

  it('picks the candidate with the most shared strong keys', () => {
    const k = { strong: ['arxiv:1', 'url:a/b'], term: [] }
    expect(pickEntry(k, [{ id: 'one', keys: ['url:a/b'] }, { id: 'two', keys: ['url:a/b', 'arxiv:1'] }])).toBe('two')
  })

  it('merges keys without duplicates and caps them', () => {
    expect(mergeKeys(['a'], { strong: ['a', 'b'], term: ['term:t'] })).toEqual(['a', 'b', 'term:t'])
    const many = Array.from({ length: 40 }, (_, i) => `k${i}`)
    expect(mergeKeys(many, { strong: ['new'], term: [] })).toHaveLength(24)
  })

  it('names entries after the repo, the single watch term, or the title', () => {
    expect(entryNameFor(item({ kind: 'model', metrics: { repoId: 'org/Zorb-7B' } }), null)).toBe('Zorb-7B')
    expect(entryNameFor(item({ kind: 'news', title: 'Long headline' }), 'Zorb')).toBe('Zorb')
    expect(entryNameFor(item({ kind: 'paper', title: 'A paper' }), 'Zorb')).toBe('A paper')
  })

  it('upgrades a news entry to the first non-news kind', () => {
    expect(mergedKind('news', 'repo')).toBe('repo')
    expect(mergedKind('model', 'news')).toBe('model')
    expect(mergedKind('model', 'repo')).toBe('model')
  })
})
