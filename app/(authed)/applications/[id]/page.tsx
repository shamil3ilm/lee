import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import * as stagesQ from '@/lib/db/queries/stages'
import * as applicationContactsQ from '@/lib/db/queries/applicationContacts'
import * as documentsQ from '@/lib/db/queries/documents'
import * as todosQ from '@/lib/db/queries/todos'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companiesQ from '@/lib/db/queries/companies'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { ApplicationActions } from '@/components/application-actions'
import { ApplicationContactsCard } from '@/components/application-contacts-card'
import { pickScoringDocument, toCvFitView, toDocScoreMap } from '@/lib/cv-score/fit'
import { CvFitCard } from '@/components/cv-score/cv-fit-card'
import { ensureJobAssessment, safely } from '@/lib/scam/service'
import { toRiskView } from '@/lib/scam/view'
import { StatusPicker } from '@/components/status-picker'
import { AddStageDialog } from '@/components/add-stage-dialog'
import { DocumentsCard } from '@/components/documents-card'
import { OutreachCard } from '@/components/outreach-card'
import { PrepPackCard } from '@/components/prep-pack-card'
import { TodosCard } from '@/components/todos-card'
import { PageHeader } from '@/components/page-header'
import { ApplicationSummaryCard } from '@/components/application/summary-card'
import { SECTION_ANCHOR, SectionNav, type SectionLink } from '@/components/section-nav'
import { JobOverviewCards } from '@/components/application/job-overview'
import { PhoneFold } from '@/components/application/phone-fold'
import { StagesView } from '@/components/application/stages-view'
import { cn } from '@/lib/utils'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Timeline } from '@/components/timeline'
import { mergeTimeline, type TimelineActivity, type TimelineStage } from '@/lib/ui/timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApplicationStatus } from '@/lib/ui/status'
import { APPLICATION_STATUSES } from '@/lib/ui/status'
import { ShareLinksCard, ShareLinksProvider } from '@/components/profile/share-links'
import { readProfileLinks, suggestLinksForJob } from '@/lib/profile/links'
import { getProfile } from '@/lib/profile/service'
import { ApplicationVariantCard } from '@/components/variants/application-variant-card'
import { variantSummaries } from '@/lib/variants/service'
import { jobSignals, suggestVariant } from '@/lib/variants/suggest'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import { loadComparisonCard } from '@/lib/compare/card-data'
import { logger } from '@/lib/logger'
import { opportunityKey } from '@/lib/compare/inputs'
import { ComparisonCard } from '@/components/compare/comparison-card'
import Link from 'next/link'
import { Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

// Enough history to find the previous same-mode score for the fit delta.
const CV_FIT_HISTORY = 10

function narrowStatus(s: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s)
    ? (s as ApplicationStatus)
    : 'saved'
}

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const userId = await requireUserId()
  // Snapshot once per request so `Date.now()` isn't called at the JSX site
  // (react-hooks/purity flags impure calls in component bodies).
  const now = new Date().getTime()
  // Everything below is keyed by (userId, id) only, so start it all at once
  // instead of awaiting the application row first. If the application does
  // not exist the page 404s and the other results are simply dropped.
  const appP = appsQ.getById(userId, id)
  const prepP = prepsQ.get(userId, id)
  // Compare with my current job (private, DB-only rules; no AI).
  const compareP = loadComparisonCard(userId, opportunityKey('application', id)).catch((err: unknown) => {
    logger.warn('compare_card_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return null
  })
  const restP = Promise.all([
    stagesQ.list(userId, id),
    actQ.list(userId, id, { limit: 50 }),
    applicationContactsQ.listForApplication(userId, id),
    // This application's documents: outreach / prep / debrief cards parse
    // their content, so this one list keeps it (scoped to one application).
    documentsQ.listWithContent(userId, { applicationId: id }),
    todosQ.list(userId, { applicationId: id }),
    cvScoresQ.listByApplication(userId, id, CV_FIT_HISTORY),
    documentsQ.list(userId, { kind: 'master_cv' }),
    // Lean id+name pickers for "Link contact" and the job edit form.
    contactsQ.listOptions(userId),
    companiesQ.listNames(userId),
  ])
  // Keep a rejection of the batch from surfacing as unhandled while we wait
  // on the application row; it is re-thrown by the await below.
  restP.catch(() => undefined)
  const [app, prep, compareCard] = await Promise.all([appP, prepP, compareP])
  if (!app) notFound()

  // v17 §1 — Scam Shield: re-assessed here when missing, stale (rules
  // version) or older than the job's last edit. Never blocks the page, and
  // runs in parallel with the page's other reads.
  const [
    riskRow,
    [stages, activities, contacts, allDocs, todos, scoreRows, masterCvs, contactOptions, companyNames],
  ] =
    await Promise.all([
      safely('application_view', () => ensureJobAssessment(userId, app.job.id)),
      restP,
    ])
  const risk = riskRow ? toRiskView(riskRow, hostLabel(app.job.sourceUrl)) : null
  // Résumé variant: the posting's region + role family pick the best fit.
  const variants = await variantSummaries(userId)
  const variantSuggestion = suggestVariant(
    variants,
    jobSignals({ title: app.job.title, location: app.job.location, remoteType: app.job.remoteType, descriptionMd: app.job.descriptionMd }),
  )
  const chosenVariant = variants.find((v) => v.id === app.resumeVariantId)
  // Profile links suggested for this job's drafts (the user confirms them).
  const linkSuggestions = suggestLinksForJob(readProfileLinks((await getProfile(userId))?.links), {
    title: app.job.title,
    description: app.job.descriptionMd,
  })

  // Split the app's documents so each card only sees the shapes it renders.
  const cvDocs = allDocs.filter((d) =>
    ['tailored_cv', 'cover_letter', 'master_cv'].includes(d.kind),
  )
  // AI usage badges: one indexed lookup for the AI-generated documents.
  const aiDocIds = allDocs.filter((d) => isAiGeneratedKind(d.kind)).map((d) => d.id)
  const [docScores, docUsage] = await Promise.all([
    cvScoresQ.latestByDocuments(
      userId,
      cvDocs.map((d) => d.id),
    ),
    aiCallLogsQ.usageByDocument(userId, aiDocIds),
  ])
  const cvFit = toCvFitView(scoreRows)
  const scoringDoc = pickScoringDocument([...allDocs, ...masterCvs])
  const outreachDocs = allDocs.filter((d) => d.kind.startsWith('outreach_'))
  const prepDocs = allDocs.filter((d) => d.kind === 'interview_prep_pack')
  const debriefDocs = allDocs.filter((d) => d.kind === 'interview_debrief')

  // Map each stage → latest debrief document id (matched via content.stageId).
  // documentsQ.list returns rows ordered by createdAt desc, so the first hit
  // per stage wins — which is the latest version we want to expose to the UI.
  const latestDebriefByStage = new Map<string, string>()
  for (const d of debriefDocs) {
    const content = d.content as { stageId?: string }
    const sid = content?.stageId
    if (typeof sid === 'string' && !latestDebriefByStage.has(sid)) {
      latestDebriefByStage.set(sid, d.id)
    }
  }

  const status = narrowStatus(app.status)

  const timelineItems = mergeTimeline(
    activities.map(
      (a): TimelineActivity => ({
        kind: 'activity',
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        activityKind: a.kind,
        payload: a.payload,
      }),
    ),
    stages.map(
      (s): TimelineStage => ({
        kind: 'stage',
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        stageKind: s.kind,
        title: s.title,
        scheduledAt: s.scheduledAt ? s.scheduledAt.toISOString() : null,
        status: s.status,
        outcome: s.outcome,
        prepNotesMd: s.prepNotesMd,
        debriefNotesMd: s.debriefNotesMd,
        durationMinutes: s.durationMinutes,
        location: s.location,
        meetingUrl: s.meetingUrl,
        googleEventId: s.googleEventId,
        debriefDocId: latestDebriefByStage.get(s.id) ?? null,
      }),
    ),
  )

  const stageBoardItems = stages.map((s) => ({
    id: s.id,
    version: s.updatedAt.toISOString(),
    kind: s.kind,
    title: s.title,
    status: s.status,
    scheduledAt: s.scheduledAt ? s.scheduledAt.toISOString() : null,
    meetingUrl: s.meetingUrl,
  }))
  // DOM order, which is also the reading order on phones (one column).
  const sections: SectionLink[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'outreach', label: 'Outreach' },
    { id: 'prep', label: 'Prep' },
    ...(compareCard ? [{ id: 'compare', label: 'Compare' }] : []),
    { id: 'documents', label: 'Documents' },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: 'Apply' },
          { label: 'Applications', href: '/applications' },
          {
            label: app.job.company?.name
              ? `${app.job.company.name} — ${app.job.title}`
              : app.job.title,
          },
        ]}
      />
      <PageHeader
        title={app.job.title}
        description={app.job.company?.name ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {status === 'saved' || prep ? (
              <Button asChild size="sm" variant={prep?.appliedAt ? 'outline' : 'default'}>
                <Link href={`/applications/${app.id}/prepare`}>
                  <Wand2 className="size-4" />
                  {prep ? (prep.appliedAt ? 'Preparation' : 'Continue preparing') : 'Prepare application'}
                </Link>
              </Button>
            ) : null}
            <StatusPicker applicationId={app.id} current={status} />
            <ApplicationActions
              applicationId={app.id}
              title={app.job.title}
              companies={[...companyNames].sort((a, b) => a.name.localeCompare(b.name))}
              initial={{
                title: app.job.title,
                sourceUrl: app.job.sourceUrl,
                companyId: app.job.companyId,
                location: app.job.location,
                remoteType: app.job.remoteType,
                employmentType: app.job.employmentType,
                salaryMin: app.job.salaryMin,
                salaryMax: app.job.salaryMax,
                salaryCurrency: app.job.salaryCurrency,
                descriptionMd: app.job.descriptionMd,
                source: app.source,
                interestLevel: app.interestLevel,
              }}
            />
          </div>
        }
      />

      <SectionNav sections={sections} />

      <ApplicationSummaryCard id="overview" className={SECTION_ANCHOR} status={status} risk={risk} job={app.job} />

      <ShareLinksProvider suggestions={linkSuggestions}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <JobOverviewCards descriptionMd={app.job.descriptionMd} parsedMeta={app.job.parsedMeta} benefits={app.job.benefits} />

          <section id="timeline" aria-label="Timeline" className={cn(SECTION_ANCHOR, 'space-y-6')}>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Timeline</CardTitle>
                <AddStageDialog applicationId={app.id} />
              </CardHeader>
              <CardContent>
                <StagesView stages={stageBoardItems}>
                  <Timeline items={timelineItems} />
                </StagesView>
              </CardContent>
            </Card>
            <TodosCard applicationId={app.id} todos={todos} now={now} />
          </section>

          {/* Outreach and prep are working tools with tabs and long titles:
              they get the wide column, the rail keeps the compact cards. */}
          <section id="outreach" aria-label="Outreach" className={SECTION_ANCHOR}>
            <OutreachCard
              applicationId={app.id}
              outreachDocs={outreachDocs}
              appliedAt={app.appliedAt ? app.appliedAt.toISOString() : null}
              usage={docUsage}
            />
          </section>

          <section id="prep" aria-label="Prep" className={SECTION_ANCHOR}>
            <PrepPackCard applicationId={app.id} stages={stages} prepDocs={prepDocs} usage={docUsage} />
          </section>

          {compareCard ? (
            <section id="compare" aria-label="Compare" className={SECTION_ANCHOR}>
              <ComparisonCard
                comparison={compareCard.comparison}
                hasCurrent={compareCard.hasCurrent}
                saved={compareCard.saved}
                citations={compareCard.citations}
              />
            </section>
          ) : null}
        </div>

        <section id="documents" aria-label="Documents" className={cn(SECTION_ANCHOR, 'min-w-0 space-y-6')}>
          <CvFitCard
            applicationId={app.id}
            fit={cvFit}
            scoringDocument={scoringDoc ? { id: scoringDoc.id, title: scoringDoc.title } : null}
          />

          <DocumentsCard
            applicationId={app.id}
            documents={cvDocs.map(withoutContent)}
            scores={toDocScoreMap(docScores)}
            usage={docUsage}
          />

          <PhoneFold label="Résumé variant">
            <ApplicationVariantCard
              applicationId={app.id}
              variants={variants}
              suggestion={variantSuggestion}
              current={chosenVariant && app.resumeVariantVersion ? { id: chosenVariant.id, name: chosenVariant.name, version: app.resumeVariantVersion } : null}
            />
          </PhoneFold>

          <PhoneFold label="Links to share">
            <ShareLinksCard />
          </PhoneFold>

          <PhoneFold label="Contacts">
            <ApplicationContactsCard
              applicationId={app.id}
              linked={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, role: c.role }))}
              options={contactOptions}
            />
          </PhoneFold>
        </section>
      </div>
      </ShareLinksProvider>

    </div>
  )
}

/** Document kinds produced by an AI generation call (they carry a usage badge). */
function isAiGeneratedKind(kind: string): boolean {
  return (
    kind === 'tailored_cv' ||
    kind === 'cover_letter' ||
    kind === 'interview_prep_pack' ||
    kind.startsWith('outreach_')
  )
}

/** Strip the content payload before a document crosses to a client card. */
function withoutContent<T extends { content: unknown }>(doc: T): Omit<T, 'content'> {
  const { content: _content, ...rest } = doc
  void _content
  return rest
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
