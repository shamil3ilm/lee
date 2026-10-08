'use client'
import { useEffect, useRef } from 'react'
import {
  isSupported,
  permissionState,
  showNotification,
} from '@/lib/notifications/browser'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const LOOKAHEAD_HOURS = 24
const TODO_STORAGE_KEY = 'employ.notified_todo_ids'
const DISCOVERY_STORAGE_KEY = 'employ.notified_discovery_ids'
const DISCOVERY_SINCE_KEY = 'employ.discovery_last_poll_at'
const RADAR_STORAGE_KEY = 'lee.notified_radar_ids'
const RADAR_SINCE_KEY = 'lee.radar_last_poll_at'
const DAY_MS = 24 * 60 * 60 * 1000

interface DueTodo {
  id: string
  title: string
  dueAt: string | null
  applicationId: string | null
}

interface NotifiableDiscovery {
  id: string
  title: string
  companyName: string | null
  matchScore: number
  createdAt: string
}

interface RadarUpdate {
  id: string
  name: string
  terms: string[]
}

interface NotifiedState {
  ids: string[]
  savedAt: number
}

function loadNotified(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as NotifiedState
    if (!Array.isArray(parsed?.ids)) return new Set()
    return new Set(parsed.ids)
  } catch {
    return new Set()
  }
}

function persistNotified(key: string, set: Set<string>): void {
  try {
    const state: NotifiedState = { ids: Array.from(set), savedAt: Date.now() }
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* storage full or disabled — drop silently */
  }
}

function loadLastPollIso(key: string = DISCOVERY_SINCE_KEY): string {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) return raw
  } catch {
    /* ignore */
  }
  // First poll of a tab session — look back 24h so we don't miss anything
  // that landed while the tab was closed.
  return new Date(Date.now() - DAY_MS).toISOString()
}

function persistLastPollIso(iso: string, key: string = DISCOVERY_SINCE_KEY): void {
  try {
    sessionStorage.setItem(key, iso)
  } catch {
    /* ignore */
  }
}

/**
 * Polls three channels every 5 minutes on any authenticated page:
 *   1. /api/todos — surfaces todos that have crossed their due time.
 *   2. /api/discoveries/notifiable — surfaces newly-ingested discoveries
 *      whose match score clears the user's threshold.
 *   3. /api/radar/notifiable — new AI Radar watch-term matches ("Instant").
 *
 * Both channels dedupe via sessionStorage keyed by entity id so a tab
 * refresh doesn't re-fire, and each maintains its own "since" watermark for
 * discoveries so we only see rows created after the previous poll.
 */
export function NotificationScheduler() {
  const notifiedTodosRef = useRef<Set<string>>(new Set())
  const notifiedDiscoveriesRef = useRef<Set<string>>(new Set())
  const lastPollIsoRef = useRef<string>('')
  const notifiedRadarRef = useRef<Set<string>>(new Set())
  const radarSinceRef = useRef<string>('')

  useEffect(() => {
    if (!isSupported()) return
    if (permissionState() !== 'granted') return

    notifiedTodosRef.current = loadNotified(TODO_STORAGE_KEY)
    notifiedDiscoveriesRef.current = loadNotified(DISCOVERY_STORAGE_KEY)
    lastPollIsoRef.current = loadLastPollIso()
    notifiedRadarRef.current = loadNotified(RADAR_STORAGE_KEY)
    radarSinceRef.current = loadLastPollIso(RADAR_SINCE_KEY)

    let cancelled = false

    async function pollTodos(): Promise<void> {
      try {
        const res = await fetch(
          `/api/todos?status=open&dueWithin=${LOOKAHEAD_HOURS}h`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        )
        if (!res.ok) return
        const json = (await res.json().catch(() => ({}))) as { todos?: DueTodo[] }
        if (cancelled) return
        const now = Date.now()
        const notified = notifiedTodosRef.current
        let changed = false
        for (const t of json.todos ?? []) {
          if (!t.dueAt) continue
          const due = new Date(t.dueAt).getTime()
          if (Number.isNaN(due)) continue
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
        if (changed) persistNotified(TODO_STORAGE_KEY, notified)
      } catch {
        /* transient — try again next tick */
      }
    }

    async function pollDiscoveries(): Promise<void> {
      try {
        const since = lastPollIsoRef.current
        const res = await fetch(
          `/api/discoveries/notifiable?since=${encodeURIComponent(since)}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        )
        if (!res.ok) return
        const json = (await res.json().catch(() => ({}))) as {
          discoveries?: NotifiableDiscovery[]
        }
        if (cancelled) return
        const items = json.discoveries ?? []
        const notified = notifiedDiscoveriesRef.current
        const fresh = items.filter((d) => !notified.has(d.id))
        // Advance the watermark BEFORE firing so a same-tick re-poll doesn't
        // resurface these rows. Dedup set is the belt-and-braces guard for
        // clock skew.
        const now = new Date().toISOString()
        lastPollIsoRef.current = now
        persistLastPollIso(now)
        if (fresh.length === 0) return
        // Sort by score desc for the summary title.
        fresh.sort((a, b) => b.matchScore - a.matchScore)
        const top = fresh[0]
        if (!top) return
        const title =
          fresh.length === 1
            ? `New job match — ${top.matchScore}%`
            : `${fresh.length} new job matches`
        const body =
          fresh.length === 1
            ? `${top.title}${top.companyName ? ` @ ${top.companyName}` : ''}`
            : `${top.title}${top.companyName ? ` @ ${top.companyName}` : ''} (top ${top.matchScore}%)`
        showNotification({
          title,
          body,
          url: '/discoveries',
          tag:
            fresh.length === 1
              ? `discovery-${top.id}`
              : `discovery-batch-${now}`,
        })
        for (const d of fresh) notified.add(d.id)
        persistNotified(DISCOVERY_STORAGE_KEY, notified)
      } catch {
        /* transient — try again next tick */
      }
    }

    // AI Radar "Instant": new watch-term matches (the route answers an
    // empty list unless that mode is on).
    async function pollRadar(): Promise<void> {
      try {
        const since = radarSinceRef.current
        const res = await fetch(`/api/radar/notifiable?since=${encodeURIComponent(since)}`)
        if (!res.ok) return
        const json = (await res.json().catch(() => ({}))) as { entries?: RadarUpdate[] }
        if (cancelled) return
        const now = new Date().toISOString()
        radarSinceRef.current = now
        persistLastPollIso(now, RADAR_SINCE_KEY)
        const notified = notifiedRadarRef.current
        const fresh = (json.entries ?? []).filter((e) => !notified.has(e.id))
        const top = fresh[0]
        if (!top) return
        showNotification({
          title: fresh.length === 1 ? `Radar: ${top.terms.join(', ')}` : `Radar: ${fresh.length} new on your watch terms`,
          body: fresh.length === 1 ? top.name : fresh.slice(0, 3).map((e) => e.name).join(' · '),
          url: fresh.length === 1 ? `/radar/${top.id}` : '/radar?watched=1',
          tag: fresh.length === 1 ? `radar-${top.id}` : `radar-batch-${now}`,
        })
        for (const e of fresh) notified.add(e.id)
        persistNotified(RADAR_STORAGE_KEY, notified)
      } catch {
        /* transient — try again next tick */
      }
    }

    async function tick(): Promise<void> {
      await Promise.allSettled([pollTodos(), pollDiscoveries(), pollRadar()])
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
