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
import { Timeline, mergeTimeline, type TimelineActivity, type TimelineStage } from '@/components/timeline'
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
  const app = await appsQ.getById(userId, id)
  if (!app) notFound()

  // v17 §1 — Scam Shield: re-assessed here when missing, stale (rules
  // version) or older than the job's last edit. Never blocks the page.
  const riskRow = await safely('application_view', () => ensureJobAssessment(userId, app.job.id))
  const risk = riskRow ? toRiskView(riskRow, hostLabel(app.job.sourceUrl)) : null

  const [stages, activities, contacts, allDocs, todos, scoreRows, masterCvs] = await Promise.all([
    stagesQ.list(userId, id),
    actQ.list(userId, id, { limit: 50 }),
    applicationContactsQ.listForApplication(userId, id),
    documentsQ.list(userId, { applicationId: id }),
    todosQ.list(userId, { applicationId: id }),
    cvScoresQ.listByApplication(userId, id, CV_FIT_HISTORY),
    documentsQ.list(userId, { kind: 'master_cv' }),
  ])

  // Split the app's documents so each card only sees the shapes it renders.
  const cvDocs = allDocs.filter((d) =>
    ['tailored_cv', 'cover_letter', 'master_cv'].includes(d.kind),
  )
  const docScores = await cvScoresQ.latestByDocuments(
    userId,
    cvDocs.map((d) => d.id),
  )
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
        googleEventId: s.googleEventId,
        debriefDocId: latestDebriefByStage.get(s.id) ?? null,
      }),
    ),
  )

  return (
    <div className="space-y-6">
      <Breadcrumbs
        className="-mb-3"
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
        actions={<StatusPicker applicationId={app.id} current={status} />}
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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

        <div className="space-y-6">
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
            documents={cvDocs}
            scores={toDocScoreMap(docScores)}
          />

          <OutreachCard
            applicationId={app.id}
            outreachDocs={outreachDocs}
            appliedAt={app.appliedAt ? app.appliedAt.toISOString() : null}
          />

          <PrepPackCard
            applicationId={app.id}
            stages={stages}
            prepDocs={prepDocs}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Points of contact</CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">None linked yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {contacts.map((c) => (
                    <li
                      key={`${c.id}-${c.role}`}
                      className="rounded-md border px-3 py-2"
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.role}
                        {c.email ? <> · <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a></> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
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
