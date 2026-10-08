// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ComparePicker, selectionText } from '@/components/compare/compare-picker'

afterEach(cleanup)

const opt = (n: number) => ({ key: `d:${n}`, label: `Job ${n}`, meta: 'Example Co' })

describe('selectionText', () => {
  it('states the rule, then the count', () => {
    expect(selectionText(0, 3)).toBe('Pick up to 3 jobs')
    expect(selectionText(2, 3)).toBe('2 of 3 selected')
  })
})

describe('ComparePicker', () => {
  it('disables further picks at the limit and says why', () => {
    render(
      createElement(ComparePicker, {
        max: 2,
        selected: ['d:1'],
        groups: [{ title: 'Discoveries', options: [opt(1), opt(2), opt(3)] }],
      }),
    )
    expect(screen.getByTestId('compare-count').textContent).toBe('1 of 2 selected')
    fireEvent.click(screen.getByRole('checkbox', { name: /Job 2/ }))
    expect(screen.getByTestId('compare-count').textContent).toBe('2 of 2 selected')
    const third = screen.getByRole('checkbox', { name: /Job 3/ }) as HTMLInputElement
    expect(third.disabled).toBe(true)
    expect(screen.getByText(/Limit reached/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Job 1/ }))
    expect(third.disabled).toBe(false)
  })
})
