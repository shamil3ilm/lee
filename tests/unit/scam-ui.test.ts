// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { assessScam } from '@/lib/scam/engine'
import { isQuarantined, toRiskView, type RiskRowLike } from '@/lib/scam/view'

const setScamVerdict = vi.fn(async () => ({ success: true as const, quarantined: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(authed)/scam/actions', () => ({ setScamVerdict }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  setScamVerdict.mockClear()
})

const TARGET = '00000000-0000-4000-8000-000000000001'

function row(over: Partial<RiskRowLike> = {}): RiskRowLike {
  const res = assessScam({
    company: 'Amazon',
    applyEmail: 'amazon.hr.desk@gmail.com',
    description: 'Pay a refundable registration fee of Rs. 999. Contact HR on WhatsApp now.',
  })
  return {
    targetType: 'discovery',
    targetId: TARGET,
    score: res.score,
    level: res.level,
    signals: res.signals,
    rulesVersion: res.rulesVersion,
    userVerdict: null,
    allowListed: false,
    ...over,
  }
}

describe('risk view', () => {
  it('quarantine rule mirrors the SQL predicate', () => {
    expect(isQuarantined({ level: 'likely_scam', userVerdict: null, allowListed: false })).toBe(true)
    expect(isQuarantined({ level: 'likely_scam', userVerdict: 'not_scam', allowListed: false })).toBe(false)
    expect(isQuarantined({ level: 'likely_scam', userVerdict: null, allowListed: true })).toBe(false)
    expect(isQuarantined({ level: 'caution', userVerdict: 'confirmed_scam', allowListed: true })).toBe(true)
    expect(isQuarantined({ level: 'caution', userVerdict: null, allowListed: false })).toBe(false)
  })

  it('flattens signals to evidence strings and tolerates junk JSON', () => {
    const v = toRiskView(row(), 'LinkedIn')
    expect(v.level).toBe('likely_scam')
    expect(v.quarantined).toBe(true)
    expect(v.board).toBe('LinkedIn')
    expect(v.signals.find((s) => s.id === 'money.upfront_fee')?.evidence[0]).toContain('registration fee')
    expect(toRiskView(row({ signals: 'nope', level: 'weird' })).signals).toEqual([])
    expect(toRiskView(row({ level: 'weird' })).level).toBe('caution')
  })
})

describe('RiskBadge', () => {
  it('opens the Why dialog with evidence, actions and the Report it panel', async () => {
    const { RiskBadge } = await import('@/components/scam/risk-badge')
    render(createElement(RiskBadge, { risk: toRiskView(row(), 'Naukri') }))
    fireEvent.click(screen.getByRole('button', { name: /Scam Shield: Likely scam/ }))
    expect(await screen.findByText(/Asks you to pay a fee/)).toBeTruthy()
    expect(screen.getByText('fee of Rs. 999')).toBeTruthy()
    expect(screen.getByText(/cybercrime\.gov\.in · helpline 1930/)).toBeTruthy()
    expect(screen.getByText(/reportfraud\.ftc\.gov/)).toBeTruthy()
    expect(screen.getByText(/Report job.*Naukri/)).toBeTruthy()
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Not a scam/ }))
    await waitFor(() => expect(setScamVerdict).toHaveBeenCalledWith('discovery', TARGET, 'not_scam'))
  })

  it('shows Safe with no report panel and a confirmed verdict as Confirmed scam', async () => {
    const { RiskBadge } = await import('@/components/scam/risk-badge')
    const safe = toRiskView(row({ level: 'safe', score: 0, signals: [] }))
    const { unmount } = render(createElement(RiskBadge, { risk: safe }))
    fireEvent.click(screen.getByRole('button', { name: /Scam Shield: Safe/ }))
    expect(await screen.findByText(/No warning signs found/)).toBeTruthy()
    expect(screen.queryByText('Report it')).toBeNull()
    unmount()

    const confirmed = toRiskView(row({ level: 'caution', userVerdict: 'confirmed_scam' }))
    render(createElement(RiskBadge, { risk: confirmed }))
    expect(screen.getByRole('button', { name: /Scam Shield: Confirmed scam/ })).toBeTruthy()
  })
})
