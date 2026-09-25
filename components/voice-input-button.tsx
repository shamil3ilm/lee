'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VoiceInputButtonProps {
  onTranscribed: (text: string) => void
  disabled?: boolean
  className?: string
  /** Optional aria-label override; defaults to "Record voice input". */
  ariaLabel?: string
}

type Mode = 'idle' | 'recording' | 'transcribing'

// Auto-stop after 60s to protect against a forgotten open mic. Same guard
// exists on the Groq side (whisper caps request duration on the free tier).
const MAX_RECORDING_MS = 60_000

/**
 * Reusable mic button that records via MediaRecorder, uploads the blob to
 * /api/voice/transcribe (Groq Whisper large v3), and appends the resulting
 * text via the `onTranscribed` callback. Handles permission-denied gracefully
 * with a friendly toast.
 *
 * Placement pattern: sit alongside a text input; the parent decides whether
 * to append (default) or replace the field value.
 */
export function VoiceInputButton({
  onTranscribed,
  disabled,
  className,
  ariaLabel,
}: VoiceInputButtonProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup any dangling stream / timer if the component unmounts mid-record.
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  const startRecording = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice input is not supported in this browser.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      toast.error('Voice input is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Prefer webm/opus (broadly supported in Chromium/Firefox/Edge). Safari
      // uses mp4/aac; MediaRecorder picks a sensible default when unspecified.
      const preferredMime = 'audio/webm;codecs=opus'
      const mimeType =
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(preferredMime)
          ? preferredMime
          : undefined
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        // Free the mic immediately — MediaStream tracks stay live until
        // explicitly stopped, which shows the browser recording indicator.
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        chunksRef.current = []
        if (blob.size === 0) {
          setMode('idle')
          return
        }

        setMode('transcribing')
        try {
          const form = new FormData()
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
          form.append('file', blob, `voice.${ext}`)
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: form,
          })
          const json = (await res.json().catch(() => ({}))) as {
            text?: string
            error?: string
          }
          if (res.ok && typeof json.text === 'string' && json.text.trim()) {
            onTranscribed(json.text.trim())
          } else if (res.ok) {
            toast.info('No speech detected.')
          } else {
            toast.error(json.error ?? 'Could not transcribe audio.')
          }
        } catch {
          toast.error('Network error — could not transcribe audio.')
        } finally {
          setMode('idle')
        }
      }

      recorder.start()
      setMode('recording')
      stopTimerRef.current = setTimeout(() => {
        stopRecording()
      }, MAX_RECORDING_MS)
    } catch (err) {
      // NotAllowedError / SecurityError → permission denied. Anything else is
      // an unexpected device error; keep the toast generic.
      const name = (err as { name?: string })?.name ?? ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        toast.error('Microphone access denied.')
      } else {
        toast.error('Could not start recording.')
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setMode('idle')
    }
  }, [onTranscribed, stopRecording])

  const onClick = useCallback(() => {
    if (mode === 'idle') {
      void startRecording()
    } else if (mode === 'recording') {
      stopRecording()
    }
  }, [mode, startRecording, stopRecording])

  const busy = mode === 'transcribing'
  const recording = mode === 'recording'

  return (
    <Button
      type="button"
      variant={recording ? 'destructive' : 'outline'}
      size="icon"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={ariaLabel ?? (recording ? 'Stop recording' : 'Record voice input')}
      className={cn('shrink-0', className)}
      title={recording ? 'Click to stop' : busy ? 'Transcribing…' : 'Voice input'}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : recording ? (
        <Square className="size-4" />
      ) : (
        <Mic className="size-4" />
      )}
    </Button>
  )
}
