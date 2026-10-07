'use client'
import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_EDITOR_PREFS, EDITOR_PREFS_KEY, parseEditorPrefs, type EditorPrefs } from '@/lib/latex/editor-prefs'

// Per-viewer layout preferences in localStorage, with an in-memory copy when
// storage is blocked. Read through useSyncExternalStore so the server render
// (defaults) hydrates without a mismatch.

let memory: string | null = null
let cachedRaw: string | null | undefined
let cachedPrefs: EditorPrefs = DEFAULT_EDITOR_PREFS
const listeners = new Set<() => void>()

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(EDITOR_PREFS_KEY) ?? memory
  } catch {
    return memory
  }
}

function snapshot(): EditorPrefs {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedPrefs = parseEditorPrefs(raw)
  }
  return cachedPrefs
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function write(next: EditorPrefs): void {
  const raw = JSON.stringify(next)
  memory = raw
  try {
    window.localStorage.setItem(EDITOR_PREFS_KEY, raw)
  } catch {
    // Storage blocked: the in-memory copy still applies for this visit.
  }
  for (const l of listeners) l()
}

export function useEditorPrefs(): [EditorPrefs, (patch: Partial<EditorPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_EDITOR_PREFS)
  const update = useCallback((patch: Partial<EditorPrefs>) => write({ ...snapshot(), ...patch }), [])
  return [prefs, update]
}
