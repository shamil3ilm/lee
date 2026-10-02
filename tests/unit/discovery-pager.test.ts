import { describe, expect, it } from 'vitest'
import { pageCount, pageItems, parsePageSize, rangeLabel } from '@/lib/discovery/pager'

describe('discovery pager', () => {
  it('labels the visible range', () => {
    expect(rangeLabel(1, 50, 734)).toBe('1–50 of 734')
    expect(rangeLabel(15, 50, 734)).toBe('701–734 of 734')
    expect(rangeLabel(1, 25, 0)).toBe('0 results')
    expect(rangeLabel(2, 100, 1_234)).toBe('101–200 of 1,234')
  })

  it('counts pages', () => {
    expect(pageCount(50, 734)).toBe(15)
    expect(pageCount(50, 0)).toBe(1)
  })

  it('numbers pages with ellipses', () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageItems(1, 15)).toEqual([1, 2, 'gap', 15])
    expect(pageItems(6, 15)).toEqual([1, 'gap', 5, 6, 7, 'gap', 15])
    expect(pageItems(15, 15)).toEqual([1, 'gap', 14, 15])
    expect(pageItems(3, 15)).toEqual([1, 2, 3, 4, 'gap', 15])
  })

  it('accepts only the offered page sizes, URL first then cookie', () => {
    expect(parsePageSize('100', '25')).toBe(100)
    expect(parsePageSize(undefined, '25')).toBe(25)
    expect(parsePageSize('7', 'junk')).toBe(50)
  })
})
