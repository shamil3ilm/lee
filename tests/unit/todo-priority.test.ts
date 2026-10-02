import { describe, expect, it } from 'vitest'
import { priorityBadge } from '@/lib/todos/priority'

describe('priorityBadge', () => {
  it('maps priorities to tinted tone badges', () => {
    expect(priorityBadge(1)).toEqual({ label: 'Low', variant: 'secondary' })
    expect(priorityBadge(2)).toEqual({ label: 'Med', variant: 'warning' })
    expect(priorityBadge(3)).toEqual({ label: 'High', variant: 'danger' })
  })

  it('returns null for no priority and unknown values', () => {
    expect(priorityBadge(0)).toBeNull()
    expect(priorityBadge(9)).toBeNull()
  })
})
