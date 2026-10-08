import { describe, expect, it } from 'vitest'
import { buildDueActions, dueLabel } from '@/lib/digest/actions'

const NOW = new Date('2026-10-08T09:00:00Z')
const DAY = 86_400_000

const app = (over: Partial<Parameters<typeof buildDueActions>[0][number]> = {}) => ({
  applicationId: 'a1',
  status: 'applied',
  nextActionAt: new Date(NOW.getTime() + DAY),
  companyName: 'Acme',
  jobTitle: 'Backend Engineer',
  ...over,
})

describe('buildDueActions', () => {
  it('names the action from the status and keeps the date', () => {
    const a = buildDueActions([app()], [], NOW)[0]!
    expect(a).toMatchObject({ applicationId: 'a1', action: 'Follow up', overdue: false })
    expect(a.at.toISOString()).toBe('2026-10-09T09:00:00.000Z')
  })

  it('marks past next actions overdue and maps saved/offer', () => {
    const rows = buildDueActions(
      [
        app({ applicationId: 's', status: 'saved', nextActionAt: new Date(NOW.getTime() - DAY) }),
        app({ applicationId: 'o', status: 'offer' }),
      ],
      [],
      NOW,
    )
    expect(rows.map((r) => [r.applicationId, r.action, r.overdue])).toEqual([
      ['s', 'Apply', true],
      ['o', 'Reply to the offer', false],
    ])
  })

  it('adds scheduled stages as interviews and sorts by date', () => {
    const rows = buildDueActions(
      [app({ nextActionAt: new Date(NOW.getTime() + 3 * DAY) })],
      [{ applicationId: 'a2', kind: 'tech_screen', title: null, scheduledAt: new Date(NOW.getTime() + DAY), companyName: 'Beta', jobTitle: 'SRE' }],
      NOW,
    )
    expect(rows.map((r) => r.action)).toEqual(['Technical screen', 'Follow up'])
    expect(rows[0]).toMatchObject({ applicationId: 'a2', companyName: 'Beta', kind: 'stage' })
  })

  it('drops the app-level action when a stage is at the same time', () => {
    const at = new Date(NOW.getTime() + DAY)
    const rows = buildDueActions(
      [app({ nextActionAt: at })],
      [{ applicationId: 'a1', kind: 'onsite', title: 'Panel with the team', scheduledAt: at, companyName: 'Acme', jobTitle: 'Backend Engineer' }],
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('Panel with the team')
  })

  it('skips applications without a next action', () => {
    expect(buildDueActions([app({ nextActionAt: null })], [], NOW)).toEqual([])
  })
})

describe('dueLabel', () => {
  it('says overdue for past dates', () => {
    expect(dueLabel({ overdue: true })).toBe('overdue')
    expect(dueLabel({ overdue: false })).toBeNull()
  })
})
