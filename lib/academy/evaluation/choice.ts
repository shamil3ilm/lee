import type { Item } from '@/lib/academy/content/schema'
import {
  capImprovements,
  notApplicable,
  type AttemptEvaluation,
  type EvaluationContext,
  type Evaluator,
} from './types'

/**
 * The built-in format of 13.0: concept checks and predict-the-output, both
 * one correct choice. Correctness gates the score (a fast wrong answer is
 * still 0); time vs par and effectiveness refine a correct one. Code axes
 * are n/a until the 13.1 runners. Pure.
 */

export interface ChoiceSubmission {
  /** The ORIGINAL index of the chosen option (display order is shuffled). */
  choice: number
}

const WEIGHTS = { correctness: 0.7, time: 0.15, effectiveness: 0.15 } as const
const NO_CODE = 'No code is run for this format'

/** 100 at or under par, falling linearly to 50 at 3× par; never below 50. */
export function timeScore(elapsedSec: number, parSec: number): number {
  if (elapsedSec <= parSec) return 100
  const over = (elapsedSec - parSec) / (2 * parSec)
  return Math.max(50, Math.round(100 - 50 * over))
}

function effectivenessScore(hintsUsed: number): number {
  return Math.max(0, 100 - 25 * hintsUsed)
}

function improvementsFor(item: Item, correct: boolean, elapsedSec: number): string[] {
  const out: string[] = []
  if (!correct) {
    out.push(`Why: ${item.explanation}`)
    out.push('Review the concept card for this skill; it will come back in your spaced reviews.')
  } else if (elapsedSec > item.parSec) {
    out.push(`Correct, in ${Math.round(elapsedSec)}s against a par of ${item.parSec}s. Recall gets faster with spaced reviews.`)
  }
  return capImprovements(out)
}

export const choiceEvaluator: Evaluator<ChoiceSubmission> = {
  formats: ['concept_check', 'predict_output'],
  parseSubmission(raw: unknown, item?: Item): ChoiceSubmission | null {
    if (typeof raw !== 'object' || raw === null) return null
    const choice = (raw as { choice?: unknown }).choice
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice > 4) return null
    if (item && choice >= item.choices.length) return null
    return { choice }
  },
  evaluate(item: Item, submission: ChoiceSubmission, ctx: EvaluationContext): AttemptEvaluation {
    const correct = submission.choice === item.answer
    const elapsedSec = Math.max(0, Math.round(ctx.elapsedSec))
    const t = timeScore(elapsedSec, item.parSec)
    const e = effectivenessScore(ctx.hintsUsed)
    const gate = correct ? 1 : 0
    const composite = Math.round(gate * (100 * WEIGHTS.correctness + t * WEIGHTS.time + e * WEIGHTS.effectiveness))
    return {
      v: 1,
      format: item.format,
      correctness: { status: 'scored', score: correct ? 100 : 0, detail: { passed: correct ? 1 : 0, total: 1, hiddenPassed: 0 } },
      time: { status: 'scored', score: t, detail: { elapsedSec, parSec: item.parSec } },
      complexity: notApplicable(NO_CODE),
      performance: notApplicable(NO_CODE),
      quality: notApplicable(NO_CODE),
      effectiveness: {
        status: 'scored',
        score: e,
        detail: { attempts: 1, hintsUsed: ctx.hintsUsed, approachOptimal: correct },
      },
      composite,
      outcome: gate,
      improvements: improvementsFor(item, correct, elapsedSec),
    }
  },
}
