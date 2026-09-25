/**
 * Emits an inline script that runs during HTML parsing (before first paint).
 * On the client the tag is rendered as `text/plain` so React never tries to
 * execute it on soft navigations; `suppressHydrationWarning` covers the type
 * mismatch. See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
