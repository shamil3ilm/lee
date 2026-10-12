import { cache } from 'react'
import Link from 'next/link'
import { AlertCircle, ListChecks } from 'lucide-react'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getSetupChecklist } from '@/lib/journey/service'
import { isOwner } from '@/lib/auth/owner'
import { gmailAccess, parseScopes } from '@/lib/google/scopes'
import { getProfile } from '@/lib/profile/service'
import { defaultsBannerFamilies } from '@/lib/discovery/relevance/view'
import { withReturn } from '@/lib/ui/settings-links'
import { Button } from '@/components/ui/button'
import { SetupPanel } from './setup-panel'
import { starCandidates, type StarCandidate } from '@/lib/coverage/line'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import type { UserProfile } from '@/lib/db/queries/profile'

/** "Where first?" chips from the user's own target regions. */
function regionChoices(profile: UserProfile | null): StarCandidate[] {
  const prefs = searchPrefsFromProfile(profile)
  return starCandidates(prefs.regionIds, prefs.remoteScope)
}

/** One checklist read per request, shared by the panel and the header link. */
// Invitees can't use Gmail (owner-only in the beta): no alert-email or Connect Google steps.
const loadChecklist = cache(async (userId: string) => getSetupChecklist(userId, { gmail: await isOwner(userId) }))

/**
 * The first-run panel: shown until setup is 80% done, then only when the
 * user opens it again from the header's "Setup" link (`/?setup=1`).
 */
export async function SetupPanelWidget({ userId, reopened }: { userId: string; reopened: boolean }) {
  const checklist = await loadChecklist(userId)
  if (checklist.retired && !reopened) return null
  const open = (key: string): boolean => checklist.items.some((i) => i.key === key && !i.done)
  const profile = open('search_prefs') || open('regions') ? await getProfile(userId) : null
  const families = open('search_prefs') ? defaultsBannerFamilies(profile) : null
  const regions = open('regions') ? regionChoices(profile) : null
  return <SetupPanel checklist={checklist} families={families} regions={regions} reopened={reopened && checklist.retired} />
}

/** Header link to the retired setup panel: "Setup 7/8". */
export async function SetupLinkWidget({ userId }: { userId: string }) {
  const checklist = await loadChecklist(userId)
  if (!checklist.retired) return null
  return (
    <Button asChild size="sm" variant="ghost" data-testid="setup-link">
      <Link href="/?setup=1#setup">
        <ListChecks className="size-4" aria-hidden="true" />
        Setup
        <span className="tabular-nums text-muted-foreground">
          {checklist.completed}/{checklist.total}
        </span>
      </Link>
    </Button>
  )
}

/**
 * Integration warnings at the top of Home: Gmail not connected means no
 * email logging, no job alerts and no calendar push, so it leads the page.
 */
export async function IntegrationAlertWidget({ userId }: { userId: string }) {
  // Gmail is owner-only in the beta (lib/google/scopes.ts gmailAccess): an
  // invitee gets no banner pointing at a dead end.
  const [owner, google] = await Promise.all([
    isOwner(userId),
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
      columns: { scope: true },
    }),
  ])
  if (!owner) return null
  if (gmailAccess(parseScopes(google?.scope), owner).read) return null
  return (
    <div
      role="status"
      data-testid="integration-alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm"
    >
      <p className="flex min-w-0 items-start gap-2 text-warning">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium">Gmail not connected.</span> Reconnect Google to log emails, read job alerts and
          push interviews to Calendar.
        </span>
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href={withReturn('/settings/integrations', '/')}>Connect Gmail</Link>
      </Button>
    </div>
  )
}
