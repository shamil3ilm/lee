/**
 * Google Calendar API v3 wrapper. Only the primary calendar is targeted —
 * v3 does not support choosing a different calendar. Tokens are already
 * refreshed by `lib/google/tokens.ts`.
 *
 * Timezones: pass explicit IANA identifiers (e.g. 'Asia/Dubai') via the
 * `start.timeZone` / `end.timeZone` fields. `dateTime` alone lets Google
 * infer, which usually surprises users when they cross regions.
 */

export interface CalendarTokens {
  accessToken: string
}

export interface CalendarDateTime {
  dateTime: string
  timeZone?: string
}

export interface CalendarEventInput {
  summary: string
  description?: string
  location?: string
  start: CalendarDateTime
  end: CalendarDateTime
  attendees?: Array<{ email: string; displayName?: string }>
}

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

function authHeaders(tokens: CalendarTokens): Record<string, string> {
  return {
    authorization: `Bearer ${tokens.accessToken}`,
    'content-type': 'application/json',
  }
}

export async function createEvent({
  tokens,
  event,
}: {
  tokens: CalendarTokens
  event: CalendarEventInput
}): Promise<{ eventId: string }> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: authHeaders(tokens),
    body: JSON.stringify(event),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`calendar createEvent ${res.status}: ${detail}`)
  }
  const json = (await res.json()) as { id?: string }
  if (!json.id) throw new Error('calendar createEvent: no event id returned')
  return { eventId: json.id }
}

export async function updateEvent({
  tokens,
  eventId,
  event,
}: {
  tokens: CalendarTokens
  eventId: string
  event: Partial<CalendarEventInput>
}): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: authHeaders(tokens),
    body: JSON.stringify(event),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`calendar updateEvent ${res.status}: ${detail}`)
  }
}

export async function deleteEvent({
  tokens,
  eventId,
}: {
  tokens: CalendarTokens
  eventId: string
}): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: authHeaders(tokens),
  })
  // Google returns 204 No Content on success; 410 Gone is safe to treat as
  // idempotent success (already deleted). 404 likewise — the event does not
  // exist so the desired state is achieved.
  if (res.ok || res.status === 404 || res.status === 410) return
  const detail = await res.text().catch(() => '')
  throw new Error(`calendar deleteEvent ${res.status}: ${detail}`)
}
