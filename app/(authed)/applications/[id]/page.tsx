import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, ExternalLink, MapPin } from 'lucide-react'
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
import { RiskBadge } from '@/components/scam/risk-badge'
import { ensureJobAssessment, safely } from '@/lib/scam/service'
import { toRiskView } from '@/lib/scam/view'
import { StatusPicker } from '@/components/status-picker'
import { AddStageDialog } from '@/components/add-stage-dialog'
import { DocumentsCard } from '@/components/documents-card'
import { OutreachCard } from '@/components/outreach-card'
import { PrepPackCard } from '@/components/prep-pack-card'
import { TodosCard } from '@/components/todos-card'
import { PageHeader } from '@/components/page-header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Timeline } from '@/components/timeline'
import { mergeTimeline, type TimelineActivity, type TimelineStage } from '@/lib/ui/timeline'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { STATUS_BADGE, STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'
import { APPLICATION_STATUSES } from '@/lib/ui/status'

export const dynamic = 'force-dynamic'

// Enough history to find the previous same-mode score for the fit delta.
const CV_FIT_HISTORY = 10

function narrowStatus(s: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s)
    ? (s as ApplicationStatus)
    : 'saved'
}

function formatSalary(
  min: number | null,
  max: number | null,
  ccy: string | null,
): string | null {
  if (min === null && max === null) return null
  const c = ccy ?? ''
  if (min !== null && max !== null) return `${c} ${min.toLocaleString()} – ${max.toLocaleString()}`.trim()
  if (min !== null) return `${c} ${min.toLocaleString()}+`.trim()
  return `${c} up to ${(max ?? 0).toLocaleString()}`.trim()
}

interface ParsedMeta {
  seniority?: string | null
  tech_stack?: string[] | null
  responsibilities?: string[] | null
  requirements?: string[] | null
}

function asParsedMeta(v: unknown): ParsedMeta {
  if (typeof v !== 'object' || v === null) return {}
  return v as ParsedMeta
}

function asBenefits(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return {}
  return v as Record<string, unknown>
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
  const app = await appP
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
  const meta = asParsedMeta(app.job.parsedMeta)
  const benefits = asBenefits(app.job.benefits)
  const salary = formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency)

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

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-sm">
          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
          {risk ? <RiskBadge risk={risk} /> : null}
          {app.job.company ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5" />
              {app.job.company.name}
            </span>
          ) : null}
          {app.job.location ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" />
              {app.job.location}
            </span>
          ) : null}
          {app.job.remoteType ? (
            <Badge variant="outline" className="capitalize">
              {app.job.remoteType}
            </Badge>
          ) : null}
          {app.job.employmentType ? (
            <Badge variant="outline" className="capitalize">
              {app.job.employmentType.replace(/_/g, ' ')}
            </Badge>
          ) : null}
          {salary ? <span className="font-medium">{salary}</span> : null}
          {app.job.sourceUrl ? (
            <a
              href={app.job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Source <ExternalLink className="size-3" />
            </a>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {app.job.descriptionMd ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Job description</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {app.job.descriptionMd}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {meta.responsibilities?.length || meta.requirements?.length || meta.tech_stack?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {meta.requirements && meta.requirements.length > 0 ? (
                  <MetaList label="Requirements" items={meta.requirements} />
                ) : null}
                {meta.responsibilities && meta.responsibilities.length > 0 ? (
                  <MetaList label="Responsibilities" items={meta.responsibilities} />
                ) : null}
                {meta.tech_stack && meta.tech_stack.length > 0 ? (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tech stack
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {meta.tech_stack.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {Object.keys(benefits).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Benefits</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {Object.entries(benefits).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b pb-2">
                      <dt className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</dt>
                      <dd className="font-medium">{formatBenefit(v)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Timeline</CardTitle>
              <AddStageDialog applicationId={app.id} />
            </CardHeader>
            <CardContent>
              <Timeline items={timelineItems} />
            </CardContent>
          </Card>

          <TodosCard applicationId={app.id} todos={todos} now={now} />

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

          <OutreachCard
            applicationId={app.id}
            outreachDocs={outreachDocs}
            appliedAt={app.appliedAt ? app.appliedAt.toISOString() : null}
            usage={docUsage}
          />

          <PrepPackCard
            applicationId={app.id}
            stages={stages}
            prepDocs={prepDocs}
            usage={docUsage}
          />

          <ApplicationContactsCard
            applicationId={app.id}
            linked={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, role: c.role }))}
            options={contactOptions}
          />
        </div>
      </div>

      <Separator />
      <div className="flex justify-end">
        <Link
          href="/applications"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Back to applications
        </Link>
      </div>
    </div>
  )
}

/** Strip the content payload before a document crosses to a client card. */
/** Document kinds produced by an AI generation call (they carry a usage badge). */
function isAiGeneratedKind(kind: string): boolean {
  return (
    kind === 'tailored_cv' ||
    kind === 'cover_letter' ||
    kind === 'interview_prep_pack' ||
    kind.startsWith('outreach_')
  )
}

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

function MetaList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

function formatBenefit(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return JSON.stringify(v)
}
