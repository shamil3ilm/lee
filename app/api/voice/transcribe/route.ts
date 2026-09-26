import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { fetchWithTimeout, GROQ_TRANSCRIBE_TIMEOUT_MS } from '@/lib/net/timeout'
import { recordAiCall } from '@/lib/ai/log-call'
import { AiUsageScope } from '@/lib/ai/usage'
import { parseGroqRateLimitHeaders } from '@/lib/ai/rate-limit-headers'
import { recordQuotaSnapshot } from '@/lib/ai/quota-snapshot'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Groq Whisper on the free tier bounds a single request; 30s is comfortably
// under Vercel Hobby's 60s cap and matches the client-side 60s max-record
// window (compression brings 60s audio well under 5MB).
export const maxDuration = 30

// Loose cap so a runaway upload can't stall the function. Whisper large v3
// happily transcribes ~25MB files; we cap at 20MB.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const TRANSCRIBE_MODEL = 'whisper-large-v3'

/** Audio duration Groq reports (verbose_json `duration`, or an OpenAI-style usage block). */
function reportedSeconds(payload: { duration?: unknown; usage?: { seconds?: unknown } }): number | null {
  const d = payload.duration ?? payload.usage?.seconds
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null
}

/**
 * POST /api/voice/transcribe
 * Multipart body with a `file` field (audio blob). Forwards the audio to
 * Groq's OpenAI-compatible whisper-large-v3 endpoint and returns
 * `{text: string, usage}`. Uses the existing GROQ_API_KEY — no additional env.
 *
 * Every upstream call is logged to ai_call_logs (model, latency, HTTP
 * status, audio seconds when Groq reports them, else the upload size —
 * never the audio or the transcript) and refreshes the rate-limit snapshot.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const apiKey = env.GROQ_API_KEY
    if (!apiKey) {
      logger.error('voice_transcribe_missing_key')
      return NextResponse.json(
        { error: 'Voice transcription is not configured.' },
        { status: 503 },
      )
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body.' }, { status: 400 })
    }
    const file = form.get('file')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'file field is required.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Audio file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Audio file exceeds 20MB limit.' },
        { status: 413 },
      )
    }

    const upstream = new FormData()
    // Groq expects an OpenAI-style multipart with a filename that hints at
    // the format. Preserve incoming filename if usable; otherwise synth one
    // based on the blob's mime type.
    const filename =
      file instanceof File && file.name
        ? file.name
        : file.type.includes('mp4')
          ? 'voice.mp4'
          : 'voice.webm'
    upstream.append('file', file, filename)
    upstream.append('model', TRANSCRIBE_MODEL)
    // verbose_json carries the audio `duration`, which the quota meters need.
    upstream.append('response_format', 'verbose_json')

    const scope = new AiUsageScope(userId)
    const log = (x: {
      status: string
      latencyMs: number
      httpStatus: number | null
      audioSeconds?: number | null
      error?: string
    }) =>
      scope.run(() =>
        recordAiCall('groq', {
          status: x.status,
          latency: x.latencyMs,
          error: x.error,
          meta: { userId, kind: 'voice_transcribe' },
          model: TRANSCRIBE_MODEL,
          httpStatus: x.httpStatus,
          audioSeconds: x.audioSeconds ?? null,
          inputBytes: x.audioSeconds == null ? file.size : null,
        }),
      )

    const start = Date.now()
    let res: Response
    try {
      res = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: upstream },
        { timeoutMs: GROQ_TRANSCRIBE_TIMEOUT_MS, label: 'groq transcription' },
      )
    } catch (err) {
      await log({
        status: 'error',
        latencyMs: Date.now() - start,
        httpStatus: null,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
    const latencyMs = Date.now() - start
    await recordQuotaSnapshot({
      userId,
      provider: 'groq',
      model: TRANSCRIBE_MODEL,
      snapshot: parseGroqRateLimitHeaders(res.headers),
    })

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      await log({
        status: res.status === 429 ? 'rate_limited' : 'error',
        latencyMs,
        httpStatus: res.status,
        error: `groq transcription ${res.status}`,
      })
      logger.error('voice_transcribe_upstream_error', {
        status: res.status,
        latencyMs,
        body: bodyText.slice(0, 300),
      })
      return NextResponse.json(
        { error: 'Transcription service failed.' },
        { status: 502 },
      )
    }

    const payload = (await res.json().catch(() => ({}))) as {
      text?: string
      duration?: unknown
      usage?: { seconds?: unknown }
    }
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    await log({
      status: 'ok',
      latencyMs,
      httpStatus: res.status,
      audioSeconds: reportedSeconds(payload),
    })
    logger.info('voice_transcribe_ok', { latencyMs, chars: text.length })
    return NextResponse.json({ text, usage: scope.usage })
  } catch (err) {
    logger.error('POST /api/voice/transcribe failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Could not transcribe audio.' },
      { status: 500 },
    )
  }
}
