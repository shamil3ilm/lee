import { describe, expect, it } from 'vitest'
import { GRADE_QUALITY, INITIAL_CARD, MAX_INTERVAL_DAYS, MIN_EASE, reviewCard, nextDue } from '@/lib/academy/srs/sm2'

describe('SM-2', () => {
  it('follows the classic 1, 6, 6×EF interval ladder on correct answers', () => {
    const first = reviewCard(INITIAL_CARD, 4)
    expect(first.repetitions).toBe(1)
    expect(first.intervalDays).toBe(1)
    const second = reviewCard(first, 4)
    expect(second.intervalDays).toBe(6)
    const third = reviewCard(second, 4)
    expect(third.intervalDays).toBe(Math.round(6 * second.ease))
  })

  it('updates ease with the SM-2 formula (q=5 raises it, q=3 lowers it)', () => {
    expect(reviewCard(INITIAL_CARD, 5).ease).toBeCloseTo(2.6, 5)
    expect(reviewCard(INITIAL_CARD, 4).ease).toBeCloseTo(2.5, 5)
    expect(reviewCard(INITIAL_CARD, 3).ease).toBeCloseTo(2.36, 5)
  })

  it('restarts repetitions on a lapse without changing ease, and counts the lapse', () => {
    const learned = reviewCard(reviewCard(INITIAL_CARD, 5), 5)
    const lapsed = reviewCard(learned, 1)
    expect(lapsed.repetitions).toBe(0)
    expect(lapsed.intervalDays).toBe(1)
    expect(lapsed.ease).toBe(learned.ease)
    expect(lapsed.lapses).toBe(learned.lapses + 1)
  })

  it('never lets ease fall below 1.3 and caps the interval', () => {
    let card = INITIAL_CARD
    for (let i = 0; i < 20; i++) card = reviewCard(card, 3)
    expect(card.ease).toBe(MIN_EASE)
    let easy = INITIAL_CARD
    for (let i = 0; i < 30; i++) easy = reviewCard(easy, 5)
    expect(easy.intervalDays).toBe(MAX_INTERVAL_DAYS)
  })

  it('does not mutate the input card', () => {
    const before = { ...INITIAL_CARD }
    reviewCard(INITIAL_CARD, 5)
    expect(INITIAL_CARD).toEqual(before)
  })

  it('maps the four buttons to SM-2 qualities and schedules the due date', () => {
    expect(GRADE_QUALITY).toEqual({ again: 1, hard: 3, good: 4, easy: 5 })
    const now = new Date('2026-10-06T10:00:00Z')
    expect(nextDue(now, 6).toISOString()).toBe('2026-10-12T10:00:00.000Z')
  })

  it('rejects qualities outside 0–5', () => {
    expect(() => reviewCard(INITIAL_CARD, 6)).toThrow()
    expect(() => reviewCard(INITIAL_CARD, -1)).toThrow()
  })
})
