import { describe, expect, it } from 'vitest'
import { cleanTerm, compileTerms, highlightSegments, matchTerms } from '@/lib/radar/match'

// Synthetic terms only (never a real watch list).
const terms = [
  { id: 't1', term: 'Zorb', aliases: ['ZRB-1'] },
  { id: 't2', term: 'Quill Runner', aliases: [] },
  { id: 't3', term: 'Muted Thing', aliases: [], muted: true },
  { id: 't4', term: 'C++', aliases: [] },
]
const compiled = compileTerms(terms)

describe('watch-term matching', () => {
  it('is case-insensitive', () => {
    expect(matchTerms(['ZORB ships today'], compiled)).toEqual(['t1'])
    expect(matchTerms(['zorb ships today'], compiled)).toEqual(['t1'])
  })

  it('respects word boundaries', () => {
    expect(matchTerms(['Zorbax is unrelated'], compiled)).toEqual([])
    expect(matchTerms(['the xzorb thing'], compiled)).toEqual([])
    expect(matchTerms(['zorb-latest model card'], compiled)).toEqual(['t1'])
    expect(matchTerms(['(Zorb), again'], compiled)).toEqual(['t1'])
  })

  it('matches aliases', () => {
    expect(matchTerms(['benchmarks for zrb-1'], compiled)).toEqual(['t1'])
    expect(matchTerms(['ZRB 1 released'], compiled)).toEqual(['t1'])
  })

  it('treats spaces, hyphens and dots inside a term as optional separators', () => {
    expect(matchTerms(['Quill-Runner beta'], compiled)).toEqual(['t2'])
    expect(matchTerms(['QuillRunner beta'], compiled)).toEqual(['t2'])
    expect(matchTerms(['quill   runner beta'], compiled)).toEqual(['t2'])
    expect(matchTerms(['Quill runs'], compiled)).toEqual([])
  })

  it('never matches muted terms', () => {
    expect(matchTerms(['the muted thing is here'], compiled)).toEqual([])
  })

  it('handles terms ending in symbols', () => {
    expect(matchTerms(['modern C++ tooling'], compiled)).toEqual(['t4'])
  })

  it('reports every matching term once, across texts', () => {
    expect(matchTerms(['Zorb and', null, 'quill runner, zorb'], compiled)).toEqual(['t1', 't2'])
  })

  it('rejects terms too short to match safely', () => {
    expect(cleanTerm(' a ')).toBe('')
    expect(cleanTerm('  Ab   cd ')).toBe('Ab cd')
    expect(compileTerms([{ id: 'x', term: '-', aliases: [] }])).toEqual([])
  })

  it('splits text into highlighted segments', () => {
    const segs = highlightSegments('New Quill Runner and zorb', compiled)
    expect(segs).toEqual([
      { text: 'New ', termId: null },
      { text: 'Quill Runner', termId: 't2' },
      { text: ' and ', termId: null },
      { text: 'zorb', termId: 't1' },
    ])
    expect(highlightSegments('nothing here', compiled)).toEqual([{ text: 'nothing here', termId: null }])
  })
})
