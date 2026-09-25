// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { computeCvScore } from '@/lib/cv-score/compute'
import { cvToScorable } from '@/lib/cv-score/extract'
import { ScoreResults } from '@/components/cv-score/score-results'
import type { CvScoreRecord } from '@/components/cv-score/client'
import { backendJd, NOW, weakCv } from '@/tests/fixtures/cv-score/cvs'

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
})
