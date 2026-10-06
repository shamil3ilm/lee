import type { Item, ItemFormat } from '@/lib/academy/content/schema'
import { choiceEvaluator } from './choice'
import type { AttemptEvaluation, EvaluationContext, Evaluator } from './types'

/** Format → evaluator. 13.1+ adds runners here; nothing else changes. */
const EVALUATORS: Readonly<Record<ItemFormat, Evaluator<unknown>>> = {
  concept_check: choiceEvaluator as Evaluator<unknown>,
  predict_output: choiceEvaluator as Evaluator<unknown>,
}

export function evaluatorFor(format: ItemFormat): Evaluator<unknown> {
  return EVALUATORS[format]
}

export class SubmissionError extends Error {
  constructor(message = 'That answer could not be read. Pick one of the options.') {
    super(message)
    this.name = 'SubmissionError'
  }
}

/** Parse and score a raw submission; throws SubmissionError when malformed. */
export function evaluateAttempt(item: Item, raw: unknown, ctx: EvaluationContext): AttemptEvaluation {
  const evaluator = evaluatorFor(item.format)
  const submission = evaluator.parseSubmission(raw, item)
  if (submission === null) throw new SubmissionError()
  return evaluator.evaluate(item, submission, ctx)
}
