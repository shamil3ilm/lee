import type { ProblemSource, StudyPlan } from '@/lib/academy/problems/schema'
import { ARRAYS_HASHING } from './arrays-hashing'
import { BACKEND } from './backend'
import { DP_INTERVALS } from './dp-intervals'
import { SQL_PROBLEMS } from './sql'
import { STACKS_STRINGS } from './stacks-strings'
import { STUDY_PLANS } from './study-plans'
import { TREES_GRAPHS } from './trees-graphs'
import { TWO_POINTERS_WINDOW } from './two-pointers-window'

/**
 * The problem set. SERVER-ONLY content: hidden tests and reference solutions
 * live here. Loaded and validated by lib/academy/problems/catalog.ts.
 */
export const PROBLEM_SOURCES: readonly ProblemSource[] = [
  ...ARRAYS_HASHING,
  ...TWO_POINTERS_WINDOW,
  ...STACKS_STRINGS,
  ...TREES_GRAPHS,
  ...DP_INTERVALS,
  ...BACKEND,
  ...SQL_PROBLEMS,
]

export const STUDY_PLAN_SOURCES: readonly StudyPlan[] = STUDY_PLANS
