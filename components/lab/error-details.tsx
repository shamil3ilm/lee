interface ErrorDetailsProps {
  /** The provider's own (already redacted) message; nothing renders when empty. */
  detail: string | null | undefined
}

/**
 * Collapsed "Details" disclosure under a friendly error: the raw provider
 * message stays one click away for debugging without leading the UI.
 */
export function ErrorDetails({ detail }: ErrorDetailsProps) {
  if (!detail) return null
  return (
    <details className="mt-2 text-[11px]">
      <summary className="cursor-pointer select-none font-medium underline-offset-2 hover:underline">
        Details
      </summary>
      <p className="mt-1 break-words font-mono">{detail}</p>
    </details>
  )
}
