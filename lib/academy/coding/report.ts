import { z } from 'zod'
import { CODE_LANGUAGES } from '@/lib/academy/problems/schema'

/**
 * The run report a browser sends back after a Submit: the outputs of every
 * case it ran (samples, then hidden), timings, the scaling points and
 * JS/TS quality metrics. The server judges it against the hidden
 * expectations, which never leave the server. Bounded so a bad client
 * cannot make the server do much work. Pure.
 */

export const CODE_MAX_CHARS = 64_000
const MAX_CASES = 64
const MAX_OUTPUT_CHARS = 200_000

const caseSchema = z.union([
  z.object({ ok: z.literal(true), output: z.unknown(), ms: z.number().min(0).max(600_000) }),
  z.object({ ok: z.literal(false), error: z.string().max(2000), ms: z.number().min(0).max(600_000) }),
])

export const runReportSchema = z.object({
  language: z.enum(CODE_LANGUAGES),
  code: z.string().max(CODE_MAX_CHARS),
  compileError: z.string().max(4000).nullable(),
  timedOut: z.boolean(),
  cases: z.array(caseSchema).max(MAX_CASES),
  scale: z
    .array(z.object({ n: z.number().int().min(1).max(10_000_000), ms: z.number().min(0).max(600_000) }))
    .max(20)
    .nullable(),
  /** ok: measured; timeout: the timing job hit its limit (too slow); failed: crashed; skipped: not run. */
  scaleStatus: z.enum(['ok', 'timeout', 'failed', 'skipped']).default('skipped'),
  quality: z.unknown().nullable(),
  memoryKb: z.number().int().min(0).max(16_000_000).nullable(),
})
export type RunReportInput = z.infer<typeof runReportSchema>

export type ParsedReport = { ok: true; report: RunReportInput } | { ok: false; error: string }

export function parseRunReport(raw: unknown): ParsedReport {
  const r = runReportSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: 'The run report could not be read. Run it again.' }
  const size = JSON.stringify(r.data.cases).length
  if (size > MAX_OUTPUT_CHARS) return { ok: false, error: 'Your outputs are too large to judge. Return only what the problem asks for.' }
  return { ok: true, report: r.data }
}
