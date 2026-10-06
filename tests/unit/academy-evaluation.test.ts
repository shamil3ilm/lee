import { describe, expect, it } from 'vitest'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { evaluatorFor, evaluateAttempt } from '@/lib/academy/evaluation/registry'
import { choiceOrder, seededShuffle } from '@/lib/academy/evaluation/shuffle'
import { compactEvaluation, EVALUATION_AXES, type AttemptEvaluation } from '@/lib/academy/evaluation/types'

const content = loadAcademyContent()
const item = content.itemById.get('async-microtask-order')!

describe('multi-axis evaluation (concept check / predict the output)', () => {
  it('scores a correct, on-par answer high and marks code-only axes n/a', () => {
    const ev = evaluateAttempt(item, { choice: item.answer }, { elapsedSec: 30, hintsUsed: 0 })
    expect(ev.correctness).toEqual({ status: 'scored', score: 100, detail: { passed: 1, total: 1, hiddenPassed: 0 } })
    expect(ev.time.status).toBe('scored')
    for (const axis of ['complexity', 'performance', 'quality'] as const) {
      expect(ev[axis].status).toBe('n/a')
    }
    expect(ev.composite).toBe(100)
    expect(ev.outcome).toBe(1)
    expect(ev.format).toBe('predict_output')
  })

  it('a wrong answer scores 0 however fast it was, and says what to improve', () => {
    const wrong = (item.answer + 1) % item.choices.length
    const ev = evaluateAttempt(item, { choice: wrong }, { elapsedSec: 5, hintsUsed: 0 })
    expect(ev.composite).toBe(0)
    expect(ev.outcome).toBe(0)
    expect(ev.improvements.join(' ')).toContain(item.explanation)
  })

  it('time is measured against par (not a race): slow answers lose a little, never below half', () => {
    const onPar = evaluateAttempt(item, { choice: item.answer }, { elapsedSec: item.parSec, hintsUsed: 0 })
    const slow = evaluateAttempt(item, { choice: item.answer }, { elapsedSec: item.parSec * 2, hintsUsed: 0 })
    const glacial = evaluateAttempt(item, { choice: item.answer }, { elapsedSec: item.parSec * 50, hintsUsed: 0 })
    expect(onPar.composite).toBe(100)
    expect(slow.composite).toBeLessThan(100)
    expect(slow.composite).toBeGreaterThan(90)
    expect(glacial.time.status === 'scored' && glacial.time.score).toBe(50)
    expect(slow.improvements.join(' ')).toMatch(/par/)
  })

  it('rejects malformed submissions', () => {
    const ev = evaluatorFor(item.format)
    expect(ev.parseSubmission({ choice: 'x' })).toBeNull()
    expect(ev.parseSubmission({ choice: 99 })).toBeNull()
    expect(ev.parseSubmission(null)).toBeNull()
    expect(ev.parseSubmission({ choice: 1 })).toEqual({ choice: 1 })
  })

  it('compacts an evaluation to its scores (for retention), keeping composite exact', () => {
    const ev = evaluateAttempt(item, { choice: item.answer }, { elapsedSec: 30, hintsUsed: 0 })
    const small = compactEvaluation(ev)
    expect(small.composite).toBe(ev.composite)
    expect(small.improvements).toEqual([])
    for (const axis of EVALUATION_AXES) {
      const a = small[axis]
      if (a.status === 'scored') expect(a.detail).toBeNull()
    }
    const roundTrip: AttemptEvaluation = JSON.parse(JSON.stringify(small))
    expect(JSON.stringify(roundTrip).length).toBeLessThan(JSON.stringify(ev).length)
  })
})

describe('choice shuffling', () => {
  it('is a deterministic permutation per seed', () => {
    const a = seededShuffle([0, 1, 2, 3], 42)
    expect(seededShuffle([0, 1, 2, 3], 42)).toEqual(a)
    expect([...a].sort()).toEqual([0, 1, 2, 3])
  })

  it('varies across seeds so the answer is not always in one place', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => choiceOrder(4, i + 1)[0]))
    expect(firsts.size).toBeGreaterThan(1)
  })
})
