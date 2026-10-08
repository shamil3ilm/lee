import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { safeReturnPath } from '@/lib/ui/return-path'

const LABELS: Readonly<Record<string, string>> = {
  '/': 'Back to Home',
  '/discoveries': 'Back to Discovery',
  '/shortlist': 'Back to Shortlist',
}

/**
 * "← Back to Home" on a settings page opened from a deep link
 * (`?from=/`), so setup steps started elsewhere return to where they began.
 * Renders nothing without a safe internal `from`.
 */
export function ReturnLink({ from }: { from: string | string[] | undefined }) {
  const path = safeReturnPath(from)
  if (!path) return null
  const label = LABELS[path.split(/[?#]/)[0] ?? ''] ?? 'Back'
  return (
    <Link
      href={path}
      data-testid="settings-return-link"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
