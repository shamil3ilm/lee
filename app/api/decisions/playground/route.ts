import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { env } from '@/lib/env'
import {
  GroqDecisionProvider,
  HeuristicDecisionProvider,
  LayaHttpDecisionProvider,
  type DecisionProvider,
} from '@/lib/decisions'
import * as profileQ from '@/lib/db/queries/profile'
import { resolveAiKey, resolveServiceSecret } from '@/lib/settings/secrets'
import { logger } from '@/lib/logger'
import { assertSafeUrl } from '@/lib/ingest/ssrf'
import { withAiUsage } from '@/lib/ai/usage'
import type { AiUsage } from '@/lib/ai/usage-types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/decisions/playground — dispatch a single decision (choice, yesNo
 * or score) to N providers in parallel and return one row per provider so the
 * playground UI can render a side-by-side comparison.
 *
 * Providers are constructed HERE (not via `getDecisionProviderForUser`) so
 * every provider selected in the UI runs directly with no fallback chain —
 * the whole point of the page is to see each provider's raw answer.
 */

const providerKindSchema = z.enum(['heuristic', 'groq', 'laya'])
type ProviderKind = z.infer<typeof providerKindSchema>

const bodySchema = z
  .object({
    type: z.enum(['choice', 'yesNo', 'score']),
    text: z.string().min(1, 'text is required').max(5000),
    providers: z
      .array(providerKindSchema)
      .min(1, 'pick at least one provider')
      .max(3),
    // choice-only
    options: z.array(z.string().min(1)).max(50).optional(),
    optionDescriptions: z.record(z.string(), z.string()).optional(),
    context: z.string().max(2000).optional(),
    // yesNo-only
    question: z.string().max(1000).optional(),
    // score-only
    rubric: z.string().max(1000).optional(),
    scale: z.tuple([z.number(), z.number()]).optional(),
    // laya-specific override
    layaEndpoint: z
      .string()
      .url()
      .refine(
        (v) => {
          try {
            assertSafeUrl(v)
            return true
          } catch {
            return false
          }
        },
        { message: 'layaEndpoint must be a public https URL' },
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'choice') {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'choice requires at least 2 options',
          path: ['options'],
        })
      }
    }
    if (data.type === 'yesNo') {
      if (!data.question || !data.question.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'yesNo requires a question',
          path: ['question'],
        })
      }
    }
    if (data.type === 'score') {
      if (!data.rubric || !data.rubric.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'score requires a rubric',
          path: ['rubric'],
        })
      }
      if (data.scale) {
        const [min, max] = data.scale
        if (!(max > min)) {
          ctx.addIssue({
            code: 'custom',
            message: 'scale max must be greater than min',
            path: ['scale'],
          })
        }
      }
    }
  })

type Body = z.infer<typeof bodySchema>

interface ResultRow {
  provider: ProviderKind
  ok: boolean
  latencyMs: number
  result?: {
    pick?: string
    confidence?: number
    answer?: boolean
    score?: number
  }
  error?: string
  raw?: unknown
  /** Token/latency usage of the logged model call (Groq); null for heuristic / Laya. */
  usage?: AiUsage | null
}

function buildProvider(
  kind: ProviderKind,
  layaEndpoint: string | undefined,
  keys: { groqKey: string | null; layaKey: string | null },
): DecisionProvider | { error: string } {
  if (kind === 'heuristic') return new HeuristicDecisionProvider()
  if (kind === 'groq') {
    if (!keys.groqKey) {
      return { error: 'No Groq key: add one in Settings › AI.' }
    }
    return new GroqDecisionProvider(keys.groqKey)
  }
  // laya
  return new LayaHttpDecisionProvider(layaEndpoint, keys.layaKey ?? undefined)
}

async function runOne(
  kind: ProviderKind,
  provider: DecisionProvider,
  body: Body,
): Promise<ResultRow> {
  const started = performance.now()
  try {
    if (body.type === 'choice') {
      // options presence enforced in body schema
      const options = body.options ?? []
      const raw = await provider.choice({
        text: body.text,
        options,
        context: body.context,
        // Laya-only extension; ignored by other providers.
        ...(body.optionDescriptions
          ? { optionDescriptions: body.optionDescriptions }
          : {}),
      } as Parameters<DecisionProvider['choice']>[0])
      const latencyMs = Math.round(performance.now() - started)
      return {
        provider: kind,
        ok: true,
        latencyMs,
        result: { pick: raw.pick, confidence: raw.confidence },
        raw,
      }
    }
    if (body.type === 'yesNo') {
      const raw = await provider.yesNo({
        text: body.text,
        question: body.question ?? '',
        context: body.context,
      })
      const latencyMs = Math.round(performance.now() - started)
      return {
        provider: kind,
        ok: true,
        latencyMs,
        result: { answer: raw.answer, confidence: raw.confidence },
        raw,
      }
    }
    // score
    const raw = await provider.score({
      text: body.text,
      rubric: body.rubric ?? '',
      scale: body.scale,
      context: body.context,
    })
    const latencyMs = Math.round(performance.now() - started)
    return {
      provider: kind,
      ok: true,
      latencyMs,
      result: { score: raw.score },
      raw,
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started)
    return {
      provider: kind,
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const body = parsed.data

    // Deduplicate provider list — running the same provider twice would just
    // return duplicate rows.
    const providers: ProviderKind[] = Array.from(new Set(body.providers))

    // Resolve Laya endpoint precedence: per-call override → profile → env.
    // Profile lookup only happens when a Laya row is actually requested.
    let layaEndpoint: string | undefined = body.layaEndpoint
    if (!layaEndpoint && providers.includes('laya')) {
      const profile = await profileQ.get(userId).catch(() => null)
      layaEndpoint = profile?.layaEndpoint ?? env.LAYA_ENDPOINT
    }

    // Saved Settings › AI keys first, env keys as the fallback.
    const [groqKey, laya] = await Promise.all([
      providers.includes('groq') ? resolveAiKey(userId, 'groq') : Promise.resolve(null),
      providers.includes('laya')
        ? resolveServiceSecret(userId, 'laya')
        : Promise.resolve({ key: null }),
    ])
    const keys = { groqKey, layaKey: laya.key }

    const settled = await Promise.allSettled(
      providers.map(async (kind): Promise<ResultRow> => {
        const built = buildProvider(kind, layaEndpoint, keys)
        if ('error' in built) {
          return { provider: kind, ok: false, latencyMs: 0, error: built.error }
        }
        // One usage scope per provider — they run concurrently.
        const { result, usage } = await withAiUsage({ userId }, () => runOne(kind, built, body))
        return { ...result, usage }
      }),
    )

    const results: ResultRow[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value
      const kind = providers[i]!
      return {
        provider: kind,
        ok: false,
        latencyMs: 0,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      }
    })

    return NextResponse.json({ results })
  } catch (err) {
    logger.error('POST /api/decisions/playground failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Could not run decision playground.' },
      { status: 500 },
    )
  }
}
