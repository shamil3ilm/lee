import { describe, expect, it } from 'vitest'
import { describeActivity } from '@/lib/digest/activity-label'

describe('describeActivity', () => {
  it('keeps the from → to of a status change', () => {
    expect(describeActivity('status_change', { from: 'applied', to: 'interview' })).toEqual({
      type: 'status',
      from: 'applied',
      to: 'interview',
    })
  })

  it('treats a missing or unknown "from" as a new application', () => {
    expect(describeActivity('status_change', { from: null, to: 'saved' })).toEqual({ type: 'status', from: null, to: 'saved' })
    expect(describeActivity('status_change', { from: 'bogus', to: 'saved' })).toEqual({ type: 'status', from: null, to: 'saved' })
  })

  it('falls back to readable text for other kinds and bad payloads', () => {
    expect(describeActivity('email', {})).toEqual({ type: 'text', text: 'Email logged' })
    expect(describeActivity('contact_added', {})).toEqual({ type: 'text', text: 'Contact added' })
    expect(describeActivity('status_change', { to: 'nope' })).toEqual({ type: 'text', text: 'Status change' })
    expect(describeActivity('follow_up_sent', null)).toEqual({ type: 'text', text: 'Follow up sent' })
  })
})
