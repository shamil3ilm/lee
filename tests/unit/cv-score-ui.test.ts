// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { computeCvScore } from '@/lib/cv-score/compute'
import { cvToScorable } from '@/lib/cv-score/extract'
import { ScoreResults } from '@/components/cv-score/score-results'
import type { CvScoreRecord } from '@/components/cv-score/client'
import { FindingEvidence } from '@/components/cv-score/finding-evidence'
import { backendJd, NOW, weakCv } from '@/tests/fixtures/cv-score/cvs'
import { TRICKY_LINKS, TRICKY_NOW, TRICKY_TEXT } from '@/tests/fixtures/cv-score/tricky'

afterEach(() => cleanup())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

function record(withJd: boolean): CvScoreRecord {
  const r = computeCvScore({
    cv: cvToScorable({ kind: 'master_cv', cv: weakCv() }),
    target: withJd ? backendJd() : null,
    ctx: { now: NOW, canAutofix: true },
    source: { kind: 'master_cv', documentId: 'doc-1', label: 'Master CV v1' },
  })
  return { ...r, id: 'score-1', createdAt: NOW.toISOString() }
}

describe('ScoreResults', () => {
  it('shows CV Quality and "pick a job" cards without a JD', () => {
    render(createElement(ScoreResults, { result: record(false), history: [] }))
    expect(screen.getAllByText('CV Quality').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pick a job')).toHaveLength(3)
    expect(screen.getByText('Impact Score')).toBeTruthy()
  })

  it('shows Total Match, every headline card and filters findings per score', () => {
    const onPreviewFix = vi.fn()
    render(createElement(ScoreResults, { result: record(true), history: [], onPreviewFix }))
    expect(screen.getAllByText('Total Match').length).toBeGreaterThan(0)
    for (const label of ['Role Match', 'Skills Match', 'Experience Match', 'ATS Score', 'Impact Score', 'Readability Score', 'Structure Score']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.queryByText('Pick a job')).toBeNull()
    // Autofixable findings expose a preview action.
    const buttons = screen.getAllByRole('button', { name: /Preview fix/ })
    fireEvent.click(buttons[0]!)
    expect(onPreviewFix).toHaveBeenCalledTimes(1)
  })

  it('shows the cited CV lines for each finding, with the phrase highlighted', () => {
    render(createElement(ScoreResults, { result: record(false), history: [] }))
    const blocks = screen.getAllByTestId('finding-evidence')
    expect(blocks.length).toBeGreaterThan(0)
    const marks = document.querySelectorAll('[data-testid="finding-evidence"] mark')
    expect([...marks].map((m) => m.textContent)).toContain('Responsible for')
    expect(screen.getAllByText(/^L\d+$/).length).toBeGreaterThan(0)
  })

  it('shows how the CV was read (roles, counted years, scope vs outcome)', () => {
    const r = computeCvScore({
      cv: cvToScorable({ kind: 'upload', text: TRICKY_TEXT, fileType: 'pdf', pageCount: 2, links: TRICKY_LINKS }),
      target: null,
      ctx: { now: TRICKY_NOW, canAutofix: false },
      source: { kind: 'upload', label: 'tricky.pdf' },
    })
    render(createElement(ScoreResults, { result: { ...r, id: null, createdAt: null }, history: [] }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'How we read it' }))
    const panel = screen.getByTestId('cv-parsed-panel')
    expect(panel.textContent).toContain('1.3 years')
    expect(panel.textContent).toContain('Brightpath Academy')
    expect(panel.textContent).toContain('Not counted')
    expect(panel.textContent).toContain('quantified (scope)')
  })

  it('marks a stored score from an older scorer version', () => {
    render(createElement(ScoreResults, { result: { ...record(false), scorerVersion: '1.0.0' }, history: [] }))
    expect(screen.getByTestId('cv-score-outdated').textContent).toContain('Older scorer v1.0.0')
  })
})

describe('FindingEvidence', () => {
  it('renders 1-based line numbers and highlights', () => {
    render(createElement(FindingEvidence, { evidence: [{ index: 4, text: 'Worked on bug fixes', highlight: 'Worked on' }] }))
    expect(screen.getByText('L5')).toBeTruthy()
    expect(document.querySelector('mark')?.textContent).toBe('Worked on')
  })
})

