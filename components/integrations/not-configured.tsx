interface NotConfiguredProps {
  provider: string
  missing: readonly string[]
  steps: readonly string[]
}

/** Shown when the deployment has no app credentials for a provider yet. */
export function NotConfigured({ provider, missing, steps }: NotConfiguredProps) {
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3 text-sm" data-testid={`${provider.toLowerCase()}-not-configured`}>
      <p className="font-medium">{provider} is not configured on this deployment.</p>
      <p className="text-xs text-muted-foreground">
        The owner adds the app credentials as environment variables (missing: {missing.map((m, i) => (
          <span key={m}>
            {i > 0 ? ', ' : ''}
            <code className="rounded bg-muted px-1">{m}</code>
          </span>
        ))}
        ), then redeploys. Setup:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Full steps: docs/integrations-github-linkedin.md in the repository.</p>
    </div>
  )
}
