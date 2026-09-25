import { Badge } from '@/components/ui/badge'
import type { KeySource } from '@/lib/lab/providers/types'

interface KeyStatusBadgeProps {
  keySource: KeySource
  last4: string | null
  needsKey: boolean
  comingSoon?: boolean
}

/** Masked key state: `Key ••••abcd` / `Env key` / `No key` / `Coming soon`. */
export function KeyStatusBadge({ keySource, last4, needsKey, comingSoon }: KeyStatusBadgeProps) {
  if (comingSoon) return <Badge variant="slate">Coming soon</Badge>
  if (!needsKey) return <Badge variant="blue">No key needed</Badge>
  if (keySource === 'db') {
    return <Badge variant="emerald">Key {last4 ? `••••${last4}` : 'saved'}</Badge>
  }
  if (keySource === 'env') return <Badge variant="indigo">Env key</Badge>
  return <Badge variant="rose">No key</Badge>
}
