import Link from 'next/link'
import { plural } from '@/lib/ui/labels'
import * as connQ from '@/lib/db/queries/integrationConnections'
import { githubAppConfig } from '@/lib/integrations/config'
import { requireUserId } from '@/lib/auth/require-session'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { isConfigured, PORTFOLIO_TOKEN_ID } from '@/lib/portfolio/config'
import { previewPublish } from '@/lib/portfolio/publish'
import { variantPageUrl } from '@/lib/portfolio/variant-paths'
import { getResumeProfile } from '@/lib/resume/service'
import { listServiceSecretStatuses } from '@/lib/settings/secrets'
import { shortDate } from '@/lib/ui/date'
import { PageHeader } from '@/components/page-header'
import { PublishPanel } from '@/components/portfolio/publish-panel'
import { PublishSettings } from '@/components/portfolio/publish-settings'
import { VariantPublishList, type VariantPublishRow } from '@/components/portfolio/variant-publish-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function PublishPage() {
  const userId = await requireUserId()
  const [state, statuses, preview, variants, { profile }, github] = await Promise.all([
    publishQ.get(userId),
    listServiceSecretStatuses(userId),
    previewPublish(userId),
    variantsQ.list(userId, { archived: true }),
    getResumeProfile(userId),
    connQ.get(userId, 'github'),
  ])
  // Connect GitHub is preferred: an installation token for this repo, else the fine-grained token.
  const owner = (state?.repo ?? '').split('/')[0]?.toLowerCase() ?? ''
  const account = typeof github?.settings.installationAccount === 'string' ? github.settings.installationAccount.toLowerCase() : null
  const viaApp = githubAppConfig().ok && Boolean(github?.installationId) && account !== null && account === owner
  const token = statuses.find((s) => s.info.id === PORTFOLIO_TOKEN_ID)
  const config = { repo: state?.repo ?? '', branch: state?.branch ?? 'main', path: state?.path ?? 'profile.json' }
  const ready = isConfigured(config) && (viaApp || (token?.source ?? 'none') !== 'none')
  // Enabled variants, plus any still on the portfolio (e.g. archived since) so they can be removed.
  const variantRows: VariantPublishRow[] = variants
    .filter((v) => v.portfolioSlug && (v.publishToPortfolio || v.portfolioLastSha))
    .map((v) => ({
      id: v.id,
      name: v.name,
      slug: v.portfolioSlug!,
      pageUrl: variantPageUrl(profile.portfolio.canonical, v.portfolioSlug!),
      status: v.portfolioPublishedAt ? `Published ${shortDate(v.portfolioPublishedAt)}${v.portfolioLastVersion ? ` (${v.portfolioLastVersion})` : ''}` : null,
      commitUrl: v.portfolioCommitUrl,
      published: v.portfolioLastSha !== null,
    }))
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
      <VariantPublishList rows={variantRows} ready={ready} />
      <p className="text-sm text-muted-foreground" data-testid="publish-auth">
        {viaApp ? (
          <>
            Publishing uses your <Link href="/settings/integrations#github" className="underline">GitHub connection</Link> (the lee app installed
            on your repository); the fine-grained token below is only the fallback.
          </>
        ) : (
          <>
            Publishing uses the fine-grained token below. Or{' '}
            <Link href="/settings/integrations#github" className="underline">connect GitHub</Link> and install the lee app on your portfolio
            repository: no personal token needed.
          </>
        )}
      </p>
      <PublishSettings config={config} token={{ source: token?.source ?? 'none', last4: token?.last4 ?? null }} />
      <Card>
        <CardHeader>
          <CardTitle>Preview JSON</CardTitle>
          <CardDescription>
            {preview.errors.length === 0
              ? 'Passes the portfolio build’s checks.'
              : `${plural(preview.errors.length, 'problem')} the portfolio build would reject — fix them in Résumé.`}
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
