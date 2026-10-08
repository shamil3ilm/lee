// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MatchBadge, MatchWhy } from '@/components/discovery/match-badge'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import type { MatchDetail } from '@/lib/discovery/match/types'

const DETAIL: MatchDetail = {
  v: 'm1',
  score: 72,
  confidence: 'full',
  requirements: [
    { text: 'PHP and Laravel', weight: 'must', status: 'met', evidence: 'Built payment webhooks in Laravel' },
    { text: 'Kubernetes', weight: 'must', status: 'missing' },
    { text: 'Redis is a plus', weight: 'nice', status: 'partial' },
  ],
  components: [
    { key: 'skills', label: 'Skills: 3 of 4 (Laravel, MySQL, PHP)', points: 30, max: 40 },
    { key: 'region', label: 'Region: Saudi Arabia', points: 10, max: 10 },
    { key: 'visa', label: 'Visa: nationals preferred', points: -5, max: 5 },
  ],
  missing: ['Kubernetes (required)'],
  matched: ['Laravel', 'MySQL', 'PHP'],
}

afterEach(cleanup)

describe('MatchBadge', () => {
  it('shows one Fit number (the blend of Match and AI) with the colour band', () => {
    render(createElement(MatchBadge, { match: 72, ai: 80, detail: DETAIL, interactive: false }))
    const badge = screen.getByTestId('match-badge')
    expect(badge.textContent).toBe('Fit 76')
    expect(badge.getAttribute('data-band')).toBe('strong')
  })

  it('marks a title-only score as approximate and low confidence', () => {
    render(createElement(MatchBadge, { match: 45, ai: null, detail: { ...DETAIL, confidence: 'title_only' }, interactive: false }))
    const badge = screen.getByTestId('match-badge')
    expect(badge.textContent).toBe('Fit ~45')
    expect(badge.getAttribute('data-band')).toBe('low')
  })

  it('opens "Why this score" with the breakdown, components, signed points and missing must-haves', async () => {
    render(createElement(MatchBadge, { match: 72, ai: null, detail: DETAIL }))
    fireEvent.click(screen.getByRole('button', { name: /Fit 72\. Why this score/ }))
    const why = await screen.findByTestId('match-why')
    expect(why.textContent).toContain('Fit 72/100 · Good fit')
    expect(screen.getByRole('list', { name: 'Fit breakdown' }).textContent).toMatch(/Match.*72/)
    expect(why.textContent).toContain('Region: Saudi Arabia')
    expect(why.textContent).toContain('-5')
    expect(screen.getByTestId('match-missing').textContent).toBe('Missing: Kubernetes (required)')
  })

  it('documents the formula, and explains filtered rows', () => {
    render(createElement(MatchWhy, { match: 72, ai: 81, detail: DETAIL, benefits: 64 }))
    const why = screen.getByTestId('match-why')
    expect(why.textContent).toContain('Fit 77/100')
    const breakdown = screen.getByRole('list', { name: 'Fit breakdown' }).textContent
    expect(breakdown).toMatch(/Match.*72/)
    expect(breakdown).toMatch(/AI.*81/)
    expect(breakdown).toMatch(/Benefits.*64/)
    expect(screen.getByTestId('fit-formula').textContent).toContain('Fit = (Match + AI) ÷ 2')
    cleanup()
    render(createElement(MatchWhy, { match: 40, ai: null, detail: null, filtered: true }))
    expect(screen.getByTestId('match-why').textContent).toContain('Filtered postings are not AI-scored')
  })

  it('renders extra reasons inside the popover', () => {
    render(createElement(MatchWhy, { match: 72, ai: null, detail: null, extra: createElement('p', null, 'Posted yesterday') }))
    expect(screen.getByTestId('match-why').textContent).toContain('Posted yesterday')
  })
})

describe('toMatchDetail', () => {
  it('reads a stored detail and drops malformed parts', () => {
    const d = toMatchDetail({ ...DETAIL, components: [...DETAIL.components, { key: 'bogus', label: 'x', points: 1, max: 1 }] })
    expect(d?.components).toHaveLength(3)
    expect(toMatchDetail(null)).toBeNull()
    expect(toMatchDetail({ score: 'x' })).toBeNull()
  })
})
