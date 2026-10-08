// @vitest-environment happy-dom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'

afterEach(cleanup)

describe('Checkbox', () => {
  it('is a native checkbox named by its label and described by its description', () => {
    render(createElement(Checkbox, { name: 'remote', label: 'Remote only', description: 'Hide on-site roles.' }))
    const box = screen.getByRole('checkbox', { name: /Remote only/ })
    expect(box.getAttribute('type')).toBe('checkbox')
    expect(box.getAttribute('name')).toBe('remote')
    const describedBy = box.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe('Hide on-site roles.')
  })

  it('toggles from a click on the label text and reports the change', () => {
    const onChange = vi.fn()
    render(createElement(Checkbox, { label: 'Select all', onChange }))
    fireEvent.click(screen.getByText('Select all'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('keeps a 16px box that never shrinks, with a 24px hit area', () => {
    render(createElement(Checkbox, { 'aria-label': 'Pick', className: 'mt-1' }))
    const input = screen.getByRole('checkbox', { name: 'Pick' })
    const wrapper = input.parentElement!
    expect(wrapper.className).toContain('shrink-0')
    expect(wrapper.className).toContain('size-4')
    expect(wrapper.className).toContain('mt-1')
    expect(input.className).toContain('size-6')
    expect(input.className).toContain('-inset-1')
  })

  it('merges a caller aria-describedby with its own description', () => {
    render(createElement(Checkbox, { label: 'A', description: 'B', 'aria-describedby': 'outer' }))
    expect(screen.getByRole('checkbox').getAttribute('aria-describedby')).toMatch(/^outer .+-description$/)
  })
})

describe('Switch', () => {
  it('is announced as a switch and works uncontrolled in a form', () => {
    render(createElement(Switch, { name: 'digest', defaultChecked: true, label: 'Weekly digest', description: 'Mondays.' }))
    const sw = screen.getByRole('switch', { name: /Weekly digest/ }) as HTMLInputElement
    expect(sw.checked).toBe(true)
    expect(sw.getAttribute('name')).toBe('digest')
    fireEvent.click(sw)
    expect(sw.checked).toBe(false)
  })

  it('renders without a label when the caller names it', () => {
    render(createElement(Switch, { 'aria-label': 'Enable source', checked: false, onChange: () => {} }))
    const sw = screen.getByRole('switch', { name: 'Enable source' })
    expect(sw.parentElement!.className).toContain('shrink-0')
    expect(sw.className).toContain('h-6')
  })
})
