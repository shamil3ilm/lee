import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/ui/status'
import { humanizeLabel } from '@/lib/ui/labels'

/**
 * What an activity row says in the digest's "Recent activity": the change
 * itself (a status move keeps its from → to) rather than the raw kind
 * ("Status Change").
 */
export type ActivityDescription =
  | { type: 'status'; from: ApplicationStatus | null; to: ApplicationStatus }
  | { type: 'text'; text: string }

const KIND_TEXT: Readonly<Record<string, string>> = {
  email: 'Email logged',
  note: 'Note added',
  contact_added: 'Contact added',
  contact_removed: 'Contact removed',
  stage: 'Interview stage updated',
}

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v)
}

export function describeActivity(kind: string, payload: unknown): ActivityDescription {
  if (kind === 'status_change' && typeof payload === 'object' && payload !== null) {
    const p = payload as { from?: unknown; to?: unknown }
    if (isStatus(p.to)) return { type: 'status', from: isStatus(p.from) ? p.from : null, to: p.to }
  }
  return { type: 'text', text: KIND_TEXT[kind] ?? humanizeLabel(kind) }
}
