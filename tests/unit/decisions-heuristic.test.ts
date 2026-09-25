import { describe, it, expect } from 'vitest'
import { HeuristicDecisionProvider } from '@/lib/decisions/heuristic'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses/categories'

const provider = new HeuristicDecisionProvider()

describe('HeuristicDecisionProvider.choice — expense categorization', () => {
  const cases: Array<{ input: string; expected: ExpenseCategory }> = [
    { input: 'Netflix', expected: 'subscription' },
    { input: 'spotify family plan', expected: 'subscription' },
    { input: 'Apple Music', expected: 'subscription' },
    { input: 'GitHub Copilot', expected: 'subscription' },
    { input: 'DEWA electricity bill', expected: 'electricity' },
    { input: 'Talabat dinner order', expected: 'dining' },
    { input: 'Careem Now', expected: 'dining' },
    { input: 'Carrefour weekly grocery run', expected: 'groceries' },
    { input: 'Spinneys', expected: 'groceries' },
    { input: 'ADNOC petrol', expected: 'fuel' },
    { input: 'Uber ride to airport', expected: 'transport' },
    { input: 'Etisalat internet', expected: 'internet' },
    { input: 'Airbnb booking Tokyo', expected: 'travel' },
    { input: 'Emirates flight to LHR', expected: 'travel' },
    { input: 'Coursera course fee', expected: 'education' },
  ]

  for (const { input, expected } of cases) {
    it(`classifies "${input}" as ${expected}`, async () => {
      const res = await provider.choice<ExpenseCategory>({
        text: input,
        options: EXPENSE_CATEGORIES,
      })
      expect(res.pick).toBe(expected)
      expect(res.confidence).toBeGreaterThan(0)
    })
  }

  it('falls back to `other` with low confidence for unmapped input', async () => {
    const res = await provider.choice<ExpenseCategory>({
      text: 'something obscure and unrelated',
      options: EXPENSE_CATEGORIES,
    })
    expect(res.pick).toBe('other')
    expect(res.confidence).toBeLessThan(0.5)
  })

  it('respects the provided options list — will not pick a hit outside it', async () => {
    // Netflix normally maps to subscription; when subscription is excluded,
    // heuristic falls back to 'other'.
    const opts: readonly ExpenseCategory[] = ['food', 'other']
    const res = await provider.choice({ text: 'Netflix', options: opts })
    expect(res.pick).toBe('other')
  })
})

describe('HeuristicDecisionProvider.yesNo / score placeholders', () => {
  it('yesNo defaults to false with mid confidence', async () => {
    const res = await provider.yesNo({ text: 'anything', question: 'is it a match?' })
    expect(res.answer).toBe(false)
    expect(res.confidence).toBe(0.5)
  })

  it('yesNo answers true when question contains a yes-word', async () => {
    const res = await provider.yesNo({
      text: 'ok',
      question: 'should we mark this as approved?',
    })
    expect(res.answer).toBe(true)
  })

  it('score returns the midpoint of the provided scale', async () => {
    const defaultScale = await provider.score({ text: 'x', rubric: 'y' })
    expect(defaultScale.score).toBe(0.5)
    const custom = await provider.score({ text: 'x', rubric: 'y', scale: [0, 10] })
    expect(custom.score).toBe(5)
  })
})
