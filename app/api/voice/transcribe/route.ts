import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Groq Whisper on the free tier bounds a single request; 30s is comfortably
// under Vercel Hobby's 60s cap and matches the client-side 60s max-record
// window (compression brings 60s audio well under 5MB).
export const maxDuration = 30

// Loose cap so a runaway upload can't stall the function. Whisper large v3
// happily transcribes ~25MB files; we cap at 20MB.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/**
 * POST /api/voice/transcribe
 * Multipart body with a `file` field (audio blob). Forwards the audio to
 * Groq's OpenAI-compatible whisper-large-v3 endpoint and returns
 * `{text: string}`. Uses the existing GROQ_API_KEY — no additional env.
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
    upstream.append('model', 'whisper-large-v3')
    upstream.append('response_format', 'json')

    const start = Date.now()
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: upstream,
    })
    const latencyMs = Date.now() - start

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
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
    }
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    logger.info('voice_transcribe_ok', { latencyMs, chars: text.length })
    return NextResponse.json({ text })
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
