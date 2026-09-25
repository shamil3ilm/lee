'use client'
import { useEffect, useRef } from 'react'
import {
  isSupported,
  permissionState,
  showNotification,
} from '@/lib/notifications/browser'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const LOOKAHEAD_HOURS = 24
const STORAGE_KEY = 'employ.notified_todo_ids'

interface DueTodo {
  id: string
  title: string
  dueAt: string | null
  applicationId: string | null
}

interface NotifiedState {
  ids: string[]
  savedAt: number
}

function loadNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as NotifiedState
    if (!Array.isArray(parsed?.ids)) return new Set()
    return new Set(parsed.ids)
  } catch {
    return new Set()
  }
}

function persistNotified(set: Set<string>): void {
  try {
    const state: NotifiedState = { ids: Array.from(set), savedAt: Date.now() }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage full or disabled — drop silently */
  }
}

/**
 * Polls /api/todos every 5 minutes for open todos due in the next 24h and
 * fires a browser notification the first time each todo's due time is in
 * the past (i.e. it just crossed the deadline).
 *
 * Deduping: sessionStorage keeps the set of already-notified todo ids for
 * the current tab so a re-render / tab-refresh doesn't re-fire. When the
 * tab closes the set clears — reasonable for a personal-use tracker.
 */
export function NotificationScheduler() {
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isSupported()) return
    if (permissionState() !== 'granted') return

    notifiedRef.current = loadNotified()

    let cancelled = false

    async function tick(): Promise<void> {
      try {
        const res = await fetch(
          `/api/todos?status=open&dueWithin=${LOOKAHEAD_HOURS}h`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          },
        )
        if (!res.ok) return
        const json = (await res.json().catch(() => ({}))) as {
          todos?: DueTodo[]
        }
        if (cancelled) return
        const now = Date.now()
        const notified = notifiedRef.current
        let changed = false
        for (const t of json.todos ?? []) {
          if (!t.dueAt) continue
          const due = new Date(t.dueAt).getTime()
          if (Number.isNaN(due)) continue
          // Fire the moment due time has passed. Overdue todos surfaced on
          // subsequent polls also fire once (dedupe handles the repeat).
          if (due > now) continue
          if (notified.has(t.id)) continue
          showNotification({
            title: 'Todo due',
            body: t.title,
            url: t.applicationId
              ? `/applications/${t.applicationId}`
              : '/todos',
            tag: `todo-${t.id}`,
          })
          notified.add(t.id)
          changed = true
        }
        if (changed) persistNotified(notified)
      } catch {
        /* transient — try again next tick */
      }
    }

    void tick()
    const timer = setInterval(() => {
      void tick()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return null
}
