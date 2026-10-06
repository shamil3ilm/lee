import { requireUserId } from '@/lib/auth/require-session'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { isConfigured, PORTFOLIO_TOKEN_ID } from '@/lib/portfolio/config'
import { previewPublish } from '@/lib/portfolio/publish'
import { listServiceSecretStatuses } from '@/lib/settings/secrets'
import { shortDate } from '@/lib/ui/date'
import { PageHeader } from '@/components/page-header'
import { PublishPanel } from '@/components/portfolio/publish-panel'
import { PublishSettings } from '@/components/portfolio/publish-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function PublishPage() {
  const userId = await requireUserId()
  const [state, statuses, preview] = await Promise.all([publishQ.get(userId), listServiceSecretStatuses(userId), previewPublish(userId)])
  const token = statuses.find((s) => s.info.id === PORTFOLIO_TOKEN_ID)
  const config = { repo: state?.repo ?? '', branch: state?.branch ?? 'main', path: state?.path ?? 'profile.json' }
  const ready = isConfigured(config) && (token?.source ?? 'none') !== 'none'
  return (
    <div className="space-y-6">
      <PageHeader
        title="Publish to portfolio"
        description="Edit in lee, publish to your portfolio repo. Only public fields leave lee; depth and readiness flags never do."
      />
      <PublishPanel
        ready={ready}
        status={state?.publishedAt ? `Published ${shortDate(state.publishedAt)}${state.lastVersion ? ` (${state.lastVersion})` : ''}` : null}
        commitUrl={state?.lastCommitUrl ?? null}
      />
      <PublishSettings config={config} token={{ source: token?.source ?? 'none', last4: token?.last4 ?? null }} />
      <Card>
        <CardHeader>
          <CardTitle>Preview JSON</CardTitle>
          <CardDescription>
            {preview.errors.length === 0
              ? 'Passes the portfolio build’s checks.'
              : `${preview.errors.length} problem(s) the portfolio build would reject — fix them in Résumé.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {preview.errors.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive" aria-label="Validation problems">
              {preview.errors.map((e) => (
                <li key={e} className="break-words">{e}</li>
              ))}
            </ul>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm text-primary">Show profile.json</summary>
            <pre data-testid="preview-json" className="mt-2 max-h-[32rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              {preview.json}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
