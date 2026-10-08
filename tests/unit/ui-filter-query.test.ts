import { describe, expect, it } from 'vitest'
import { filterQuery, mergeQuery, withQuery } from '@/lib/ui/filter-query'

describe('filterQuery', () => {
  it('keeps set values in form order and drops empty ones', () => {
    const entries: Array<[string, string]> = [
      ['category', 'gmail'],
      ['level', ''],
      ['q', '  groq  '],
    ]
    expect(filterQuery(entries)).toBe('category=gmail&q=groq')
  })

  it('always drops page, so a filter change starts on page 1', () => {
    expect(filterQuery([['page', '3'], ['source', 'hn']])).toBe('source=hn')
  })

  it('drops values equal to their default', () => {
    expect(filterQuery([['range', '7d'], ['sort', 'title']], { defaults: { range: '7d', sort: 'default' } })).toBe(
      'sort=title',
    )
  })

  it('keeps repeated keys (multi-select checkboxes) and ignores files', () => {
    const file = new File(['x'], 'x.txt')
    expect(filterQuery([['tag', 'a'], ['tag', 'b'], ['upload', file]])).toBe('tag=a&tag=b')
  })

  it('reads FormData entries', () => {
    const fd = new FormData()
    fd.append('watched', '1')
    fd.append('since', '')
    expect(filterQuery(fd.entries())).toBe('watched=1')
  })
})

describe('mergeQuery', () => {
  it('sets, replaces and deletes keys and resets page', () => {
    expect(mergeQuery('?sort=posted&page=4&region=ae', { sort: 'match', region: '', q: 'rust' })).toBe('sort=match&q=rust')
    expect(mergeQuery(new URLSearchParams('a=1'), { a: null, b: undefined })).toBe('')
  })
})

describe('withQuery', () => {
  it('joins a path and a query, leaving the bare path when empty', () => {
    expect(withQuery('/radar', 'source=hn')).toBe('/radar?source=hn')
    expect(withQuery('/radar', '')).toBe('/radar')
  })
})
