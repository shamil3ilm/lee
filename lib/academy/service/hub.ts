import * as stateQ from '@/lib/db/queries/academyState'
import { currentStreak } from '@/lib/academy/gamification/streak'
import { RANK_LABELS, nextRankHint } from '@/lib/academy/gamification/rank'
import type { Rank } from '@/lib/academy/content/schema'
import { RANKS } from '@/lib/academy/content/schema'
import { readySuggestions, byTargetDate, type ReadySuggestion } from '@/lib/academy/placement/study'
import type { UnmappedStudyItem } from '@/lib/academy/placement/study'
import { domainsForStage, stageKindLabel } from '@/lib/academy/selector/interviews'
import type { PlanItem, PlanMode } from '@/lib/academy/selector/types'
import { getTodayPlan, toMode, type PlanContext } from './plan'
import { levelMap } from './skill-states'

/** Everything the /playground hub shows, in one read. */

export interface RadarPoint {
  domainId: string
  domain: string
  level: number
}

export interface InterviewFocus {
  stageId: string
  label: string
  company: string
  scheduledAt: Date
  skills: Array<{ id: string; name: string; level: number }>
}

export interface StudyRow {
  studyItemId: string
  label: string
  context: string
  depth: string
  targetDate: string
  notes: string
  skillId: string
  skillName: string
  level: number
}

export interface HubData {
  today: string
  timeZone: string
  plan: PlanItem[]
  xp: number
  rank: Rank
  rankLabel: string
  nextRank: string | null
  streak: number
  bestStreak: number
  timeBudgetMin: number
  mode: PlanMode
  radar: RadarPoint[]
  dueReviews: number
  interviews: InterviewFocus[]
  study: StudyRow[]
  unmappedStudy: UnmappedStudyItem[]
  suggestions: ReadySuggestion[]
  placement: { done: boolean; started: boolean; remaining: number }
  achievements: Array<{ id: string; name: string; description: string; earnedAt: Date }>
  assessedSkills: number
}

function radar(ctx: PlanContext, levels: ReadonlyMap<string, number>): RadarPoint[] {
  return ctx.content.graph.domains.map((d) => {
    const ls = ctx.content.graph.skills.filter((s) => s.domain === d.id).map((s) => levels.get(s.id) ?? 0).filter((l) => l > 0)
    const avg = ls.length > 0 ? ls.reduce((a, b) => a + b, 0) / ls.length : 0
    return { domainId: d.id, domain: d.name, level: Math.round(avg * 10) / 10 }
  })
}

function interviewFocus(ctx: PlanContext, levels: ReadonlyMap<string, number>): InterviewFocus[] {
  return ctx.interviews.map((i) => {
    const domains = domainsForStage(i.kind)
    const skills = ctx.content.graph.skills
      .filter((s) => domains.includes(s.domain))
      .map((s) => ({ id: s.id, name: s.name, level: levels.get(s.id) ?? 0 }))
      .sort((a, b) => a.level - b.level)
      .slice(0, 4)
    return { stageId: i.stageId, label: stageKindLabel(i.kind), company: i.company, scheduledAt: i.scheduledAt, skills }
  })
}

function studyRows(ctx: PlanContext, levels: ReadonlyMap<string, number>): StudyRow[] {
  return [...ctx.placement.studyTargets].sort(byTargetDate).map((t) => ({
    studyItemId: t.studyItemId,
    label: t.label,
    context: t.context,
    depth: t.depth,
    targetDate: t.targetDate,
    notes: t.notes,
    skillId: t.skillId,
    skillName: ctx.content.graph.byId.get(t.skillId)?.name ?? t.skillId,
    level: levels.get(t.skillId) ?? 0,
  }))
}

function toRank(value: string): Rank {
  return (RANKS as readonly string[]).includes(value) ? (value as Rank) : 'intern'
}

export async function getHubData(userId: string, now: Date = new Date()): Promise<HubData> {
  const { ctx, items } = await getTodayPlan(userId, now)
  const levels = levelMap(ctx.ratingRows)
  const earned = await stateQ.listAchievements(userId)
  const catalog = new Map(ctx.content.achievements.map((a) => [a.id, a]))
  const rank = toRank(ctx.state.rank)
  const skillName = (id: string): string => ctx.content.graph.byId.get(id)?.name ?? id
  return {
    today: ctx.today,
    timeZone: ctx.timeZone,
    plan: items,
    xp: ctx.state.xp,
    rank,
    rankLabel: RANK_LABELS[rank],
    nextRank: nextRankHint(rank),
    streak: currentStreak({ streakDays: ctx.state.streakDays, lastActiveDate: ctx.state.lastActiveDate }, ctx.today),
    bestStreak: ctx.state.bestStreak,
    timeBudgetMin: ctx.state.timeBudgetMin,
    mode: toMode(ctx.state.mode),
    radar: radar(ctx, levels),
    dueReviews: ctx.dueReviews,
    interviews: interviewFocus(ctx, levels),
    study: studyRows(ctx, levels),
    unmappedStudy: ctx.placement.unmappedStudy,
    suggestions: readySuggestions(ctx.placement.studyTargets, levels, skillName),
    placement: { done: ctx.inputs.placement.done, started: ctx.state.placementStartedAt !== null, remaining: ctx.inputs.placement.remaining },
    achievements: earned
      .flatMap((a) => {
        const def = catalog.get(a.achievementId)
        return def ? [{ id: def.id, name: def.name, description: def.description, earnedAt: a.earnedAt }] : []
      })
      .sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime()),
    assessedSkills: [...levels.values()].filter((l) => l > 0).length,
  }
}
