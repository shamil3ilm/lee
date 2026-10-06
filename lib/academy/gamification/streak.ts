import { daysBetween } from '@/lib/academy/day'

/** Daily streak over the user's local days. Pure. */

export interface StreakState {
  streakDays: number
  lastActiveDate: string | null
}

export function nextStreak(state: StreakState, today: string): StreakState {
  if (!state.lastActiveDate) return { streakDays: 1, lastActiveDate: today }
  const gap = daysBetween(state.lastActiveDate, today)
  if (gap <= 0) return { streakDays: Math.max(1, state.streakDays), lastActiveDate: state.lastActiveDate }
  if (gap === 1) return { streakDays: state.streakDays + 1, lastActiveDate: today }
  return { streakDays: 1, lastActiveDate: today }
}

/** The streak as shown today: 0 once a full day was missed. */
export function currentStreak(state: StreakState, today: string): number {
  if (!state.lastActiveDate) return 0
  return daysBetween(state.lastActiveDate, today) <= 1 ? state.streakDays : 0
}
