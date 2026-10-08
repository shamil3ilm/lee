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
  it('shows Match and AI with the colour band', () => {
    render(createElement(MatchBadge, { match: 72, ai: 80, detail: DETAIL, interactive: false }))
    const badge = screen.getByTestId('match-badge')
    expect(badge.textContent).toBe('Match 72 · AI 80')
    expect(badge.getAttribute('data-band')).toBe('good')
  })

  it('opens "Why this score" with components, signed points and missing must-haves', async () => {
    render(createElement(MatchBadge, { match: 72, ai: null, detail: DETAIL }))
    fireEvent.click(screen.getByRole('button', { name: /Why this score/ }))
    const why = await screen.findByTestId('match-why')
    expect(why.textContent).toContain('Match 72/100 · Good match')
    expect(why.textContent).toContain('Region: Saudi Arabia')
    expect(why.textContent).toContain('-5')
    expect(screen.getByTestId('match-missing').textContent).toBe('Missing: Kubernetes (required)')
  })

  it('explains the blend when both scores exist, and filtered rows', () => {
    render(createElement(MatchWhy, { match: 72, ai: 81, detail: DETAIL }))
    expect(screen.getByTestId('match-why').textContent).toContain('Ranked by the mean of both: 77.')
    cleanup()
    render(createElement(MatchWhy, { match: 40, ai: null, detail: null, filtered: true }))
    expect(screen.getByTestId('match-why').textContent).toContain('Filtered postings are not AI-scored')
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
