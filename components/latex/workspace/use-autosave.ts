'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveLatexSource } from '@/app/(authed)/documents/[id]/edit/actions'

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

export const AUTOSAVE_DELAY_MS = 2000

interface Snapshot {
  source: string
  title: string
}

/**
 * Autosave for main.tex and the title: 2 s after the last change, one save
 * in flight at a time, the latest snapshot always wins. saveNow() (Ctrl/⌘+S)
 * skips the wait.
 */
export function useAutosave(documentId: string, source: string, title: string) {
  const [state, setState] = useState<SaveState>('saved')
  const saved = useRef<Snapshot>({ source, title })
  const latest = useRef<Snapshot>({ source, title })
  const inFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const again = useRef<() => void>(() => undefined)

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const snap = latest.current
    if (snap.source === saved.current.source && snap.title === saved.current.title) {
      setState('saved')
      return
    }
    if (inFlight.current) return
    inFlight.current = true
    setState('saving')
    try {
      const result = await saveLatexSource({
        documentId,
        source: snap.source,
        title: snap.title.trim() || undefined,
        autosave: true,
      })
      if ('error' in result) {
        setState('error')
        return
      }
      saved.current = snap
      const now = latest.current
      setState(now.source === snap.source && now.title === snap.title ? 'saved' : 'unsaved')
    } catch {
      setState('error')
    } finally {
      inFlight.current = false
    }
    // Changes made while saving: save them too.
    const now = latest.current
    if (now.source !== saved.current.source || now.title !== saved.current.title) again.current()
  }, [documentId])
  useEffect(() => {
    again.current = () => void flush()
  }, [flush])

  useEffect(() => {
    latest.current = { source, title }
    if (source === saved.current.source && title === saved.current.title) return
    setState((s) => (s === 'saving' ? s : 'unsaved'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
  }, [source, title, flush])

  // Last chance on tab close: warn while there are unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const now = latest.current
      if (now.source !== saved.current.source || now.title !== saved.current.title) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { state, saveNow: flush }
}
