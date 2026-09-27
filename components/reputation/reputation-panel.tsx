import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReputationView } from '@/lib/reputation/view'
import { GoogleRating } from './google-rating'
import { ReputationCriteria } from './reputation-criteria'
import { ReputationLinks } from './reputation-links'
import { ReputationRatings } from './reputation-ratings'
import { ReputationRefreshButton } from './reputation-refresh-button'
import { ReputationFacts, ReputationSignals } from './reputation-signals'
import { ReputationSummary } from './reputation-summary'

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Company reputation (docs/company-reviews.md): free public signals with
 * their sources, deep links to review sites lee never fetches, the user's
 * own ratings, an on-demand AI summary the user confirms, and how the
 * confirmed data moves the score.
 */
export function ReputationPanel({ view }: { view: ReputationView }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reputation</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {view.fetchedAtLabel ? `Signals refreshed ${view.fetchedAtLabel}` : 'Signals not fetched yet'} · weekly while
            watched
          </p>
        </div>
        <ReputationRefreshButton companyId={view.companyId} />
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        <Section title="Summary" hint="AI suggests from the signals and your ratings; you confirm.">
          <ReputationSummary companyId={view.companyId} summary={view.summary} citations={view.citations} />
        </Section>
        <Section title="Effect on scoring" hint="Only confirmed data counts. Unknown lowers confidence, not the score.">
          <ReputationCriteria criteria={view.criteria} />
        </Section>
        <Section title="Signals" hint="Hacker News, news (GDELT) and Wikidata — each with its source and date.">
          <ReputationFacts facts={view.facts} />
          <ReputationSignals signals={view.signals} statuses={view.statuses} />
        </Section>
        <Section
          title="Your ratings"
          hint="Review sites don't allow automated access. Open them below and record what you read."
        >
          <ReputationLinks groups={view.deepLinks} />
          <ReputationRatings companyId={view.companyId} ratings={view.ratings} />
        </Section>
        {view.places.enabled ? (
          <Section title="Google rating" hint="Your Google Places key, capped per month in Settings › Integrations.">
            <GoogleRating companyId={view.companyId} capLeft={view.places.capLeft} />
          </Section>
        ) : null}
      </CardContent>
    </Card>
  )
}
