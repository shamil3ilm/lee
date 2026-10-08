// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/settings/logs',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const { AutoApplyForm } = await import('@/components/filters/auto-apply-form')

function renderForm(status = '3 events') {
  return render(
    createElement(
      AutoApplyForm,
      { action: '/settings/logs', label: 'Filter logs', status, clearHref: '/settings/logs', defaults: { range: '7d' } },
      createElement(
        'select',
        { name: 'level', 'aria-label': 'Level', defaultValue: '' },
        createElement('option', { value: '' }, 'All'),
        createElement('option', { value: 'error' }, 'Errors'),
      ),
      createElement('input', { type: 'hidden', name: 'range', value: '7d' }),
      createElement('input', { type: 'search', name: 'q', 'aria-label': 'Search', defaultValue: '' }),
    ),
  )
}

beforeEach(() => {
  replace.mockClear()
  window.history.replaceState(null, '', '/settings/logs')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AutoApplyForm', () => {
  it('is a named search landmark with a polite results status and no Apply button', () => {
    renderForm()
    expect(screen.getByRole('search', { name: 'Filter logs' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('3 events')
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
    // Nothing filtered yet: no Clear link.
    expect(screen.queryByRole('link', { name: 'Clear' })).toBeNull()
  })

  it('applies a select change at once, leaving defaults out of the URL', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'error' } })
    expect(replace).toHaveBeenCalledWith('/settings/logs?level=error', { scroll: false })
  })

  it('debounces typing and applies once it pauses', () => {
    vi.useFakeTimers()
    renderForm()
    const search = screen.getByLabelText('Search')
    fireEvent.change(search, { target: { value: 'gr' } })
    fireEvent.change(search, { target: { value: 'groq' } })
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/settings/logs?q=groq', { scroll: false })
  })

  it('applies at once on submit (Enter) and cancels the pending debounce', () => {
    vi.useFakeTimers()
    renderForm()
    const search = screen.getByLabelText('Search')
    fireEvent.change(search, { target: { value: 'groq' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(replace).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('shows Clear while a filter is set', () => {
    window.history.replaceState(null, '', '/settings/logs?level=error')
    renderForm()
    expect(screen.getByRole('link', { name: 'Clear' }).getAttribute('href')).toBe('/settings/logs')
  })
})
