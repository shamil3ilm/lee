// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MatchBadge, MatchWhy } from '@/components/discovery/match-badge'
import { GrowthWhy } from '@/components/companies/growth-chip'
import { discoveryPrefsFromForm } from '@/lib/discovery/relevance/form'
import { parseDiscoveryPrefs } from '@/lib/discovery/relevance/discovery-prefs'

afterEach(cleanup)

describe('company growth on job cards ("Why this score")', () => {
  it('shows "Company growth: 78" in the popover and keeps it out of Fit by default', () => {
    render(createElement(MatchWhy, { match: 70, ai: 70, detail: null, growth: { score: 78, confidence: 'high', inFit: false } }))
    const line = screen.getByTestId('company-growth-line')
    expect(line.textContent).toContain('Company growth: 78')
    expect(line.textContent).toContain('not in Fit')
    expect(screen.getByText(/Fit 70\/100/)).toBeTruthy()
  })

  it('with "Factor company growth into Fit" on, the badge and the popover move by the nudge', () => {
    render(createElement(MatchBadge, { match: 70, ai: 70, detail: null, interactive: false, growth: { score: 78, confidence: 'high', inFit: true } }))
    expect(screen.getByTestId('match-badge').textContent).toBe('Fit 73')
    cleanup()
    render(createElement(MatchWhy, { match: 70, ai: 70, detail: null, growth: { score: 78, confidence: 'high', inFit: true } }))
    expect(screen.getByTestId('company-growth-line').textContent).toContain('in Fit: +3')
  })

  it('low confidence never moves Fit; unknown growth shows no line', () => {
    render(createElement(MatchBadge, { match: 70, ai: 70, detail: null, interactive: false, growth: { score: 95, confidence: 'low', inFit: true } }))
    expect(screen.getByTestId('match-badge').textContent).toBe('Fit 70')
    cleanup()
    render(createElement(MatchWhy, { match: 70, ai: 70, detail: null, growth: { score: null, confidence: null, inFit: true } }))
    expect(screen.queryByTestId('company-growth-line')).toBeNull()
  })
})

describe('Settings › Search: "Factor company growth into Fit"', () => {
  it('is off by default and read from the form checkbox', () => {
    expect(discoveryPrefsFromForm(new FormData()).growthInFit).toBe(false)
    const fd = new FormData()
    fd.set('growthInFit', 'on')
    expect(discoveryPrefsFromForm(fd).growthInFit).toBe(true)
    expect(parseDiscoveryPrefs({ growthInFit: 'yes' }).growthInFit).toBe(false)
  })
})

describe('growth "Why" popover on company cards', () => {
  it('lists measured signals with source, date and confidence, and the unknown ones apart', () => {
    render(
      createElement(GrowthWhy, {
        g: {
          score: 81,
          confidence: 'medium',
          signals: [
            { kind: 'hiring', score: 92, detail: '8 open roles now; 3 about 90 days ago', source: 'Lever job board, weekly counts', date: '2026-10-08', confidence: 'high' },
            { kind: 'news', score: null, detail: 'No funding, expansion or layoff news found in the last 12 months', source: 'GDELT news', date: null, confidence: 'low' },
          ],
        },
      }),
    )
    expect(screen.getByText('Growth 81 · medium confidence')).toBeTruthy()
    const known = screen.getByRole('list', { name: 'Measured growth signals' })
    expect(known.textContent).toContain('Hiring velocity')
    expect(known.textContent).toContain('Lever job board, weekly counts · 2026-10-08 · high confidence · weight 30')
    expect(screen.getByRole('list', { name: 'Growth signals not measured yet' }).textContent).toContain('unknown')
  })
})
