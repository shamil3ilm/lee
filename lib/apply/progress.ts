import { z } from 'zod'

/**
 * Prepare-application progress (application_preps.progress). Pure and
 * client-safe. Every step can be skipped; nothing is ever sent.
 *
 *   variant → tailor → cover → checklist → applied
 */

export const PREP_STEPS = ['variant', 'tailor', 'cover', 'checklist', 'applied'] as const
export type PrepStep = (typeof PREP_STEPS)[number]
/** Steps before "Mark applied"; all done or skipped → prepared. */
export const PREPARE_STEPS = ['variant', 'tailor', 'cover', 'checklist'] as const
export type PrepareStep = (typeof PREPARE_STEPS)[number]

export const STEP_LABELS: Readonly<Record<PrepStep, string>> = {
  variant: 'Résumé variant',
  tailor: 'Tailored CV',
  cover: 'Cover letter',
  checklist: 'Checklist',
  applied: 'Mark applied',
}

const status = z.enum(['done', 'skipped'])
const uuid = z.string().uuid()
const version = z.number().int().positive()
const score = z.number().int().min(0).max(100).nullable()

const docRef = z.object({ id: uuid, kind: z.string().max(40), version })

export const prepProgressSchema = z.object({
  variant: z
    .object({ status, variantId: uuid.nullable().optional(), version: version.nullable().optional() })
    .optional(),
  tailor: z
    .object({
      status,
      documentId: uuid.optional(),
      version: version.optional(),
      /** CV Score (deterministic, no AI) of the starting variant / master and the tailored CV. */
      scoreBefore: score.optional(),
      scoreAfter: score.optional(),
    })
    .optional(),
  cover: z
    .object({ status, documentId: uuid.optional(), version: version.optional(), linkIds: z.array(z.string().max(40)).max(12).optional() })
    .optional(),
  checklist: z.object({ status, checked: z.array(z.string().max(40)).max(40) }).optional(),
  applied: z
    .object({
      at: z.string().max(40),
      variantId: uuid.nullable(),
      variantVersion: version.nullable(),
      documents: z.array(docRef).max(6),
    })
    .optional(),
})

export type PrepProgress = z.infer<typeof prepProgressSchema>

/** Stored progress, defensively (unknown or broken JSON → empty). */
export function parseProgress(raw: unknown): PrepProgress {
  const parsed = prepProgressSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : {}
}

export function stepDone(p: PrepProgress, step: PrepStep): boolean {
  if (step === 'applied') return p.applied !== undefined
  return p[step] !== undefined
}

/** The first step that is neither done nor skipped; 'applied' once prepared. */
export function currentStep(p: PrepProgress): PrepStep {
  return PREP_STEPS.find((s) => !stepDone(p, s)) ?? 'applied'
}

export function isPrepared(p: PrepProgress): boolean {
  return PREPARE_STEPS.every((s) => stepDone(p, s))
}

export function counts(p: PrepProgress): { done: number; skipped: number } {
  const states = PREPARE_STEPS.map((s) => p[s]?.status)
  return { done: states.filter((s) => s === 'done').length, skipped: states.filter((s) => s === 'skipped').length }
}

/** CV Score change made by tailoring (null when either side is unknown). */
export function scoreDelta(p: PrepProgress): number | null {
  const before = p.tailor?.scoreBefore
  const after = p.tailor?.scoreAfter
  return typeof before === 'number' && typeof after === 'number' ? after - before : null
}
