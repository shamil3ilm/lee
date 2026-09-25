import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Briefcase,
  Building2,
  ExternalLink,
  Globe,
  MapPin,
  StickyNote,
} from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as companiesQ from '@/lib/db/queries/companies'
import { CompanyHeaderActions } from '@/components/company-header-actions'
import { CompanyInterestPicker } from '@/components/company-interest-picker'
import { CompanyStancePicker } from '@/components/company-stance-picker'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { shortDate } from '@/lib/ui/date'
import {
  STATUS_BADGE,
  STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@/lib/ui/status'

export const dynamic = 'force-dynamic'

function narrowStatus(s: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s)
    ? (s as ApplicationStatus)
    : 'saved'
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const userId = await requireUserId()
  const detail = await companiesQ.getWithApplicationsAndContacts(userId, id)
  if (!detail) notFound()

  const { company, applications: apps, jobs, contacts } = detail
  const unappliedJobs = jobs.filter((j) => !j.hasApplication)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        className="-mb-3"
        items={[
          { label: 'Find' },
          { label: 'Companies', href: '/companies' },
          { label: company.name },
        ]}
      />
      <PageHeader
        title={company.name}
        description={company.domain ?? undefined}
        actions={
          <CompanyHeaderActions
            companyId={company.id}
            companyName={company.name}
            initial={{
              name: company.name,
              domain: company.domain,
              website: company.website,
              headquartersCity: company.headquartersCity,
              headquartersCountry: company.headquartersCountry,
              size: company.size,
              stage: company.stage,
              notesMd: company.notesMd,
            }}
          />
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-sm">
          {company.domain ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Globe className="size-3.5" />
              {company.domain}
            </span>
          ) : null}
          {company.website ? (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Website <ExternalLink className="size-3" />
            </a>
          ) : null}
          {company.headquartersCity || company.headquartersCountry ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" />
              {[company.headquartersCity, company.headquartersCountry].filter(Boolean).join(', ')}
            </span>
          ) : null}
          {company.size ? <Badge variant="outline">{company.size}</Badge> : null}
          {company.stage ? (
            <Badge variant="outline" className="capitalize">
              {company.stage.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Applications
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No applications tied to this company yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {apps.map((a) => {
                    const s = narrowStatus(a.status)
                    return (
                      <li key={a.id}>
                        <Link
                          href={`/applications/${a.id}`}
                          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-all hover:border-primary/50 hover:bg-accent/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{a.jobTitle}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.appliedAt ? `Applied ${shortDate(a.appliedAt)}` : 'Not yet applied'}
                            </div>
                          </div>
                          <Badge variant={STATUS_BADGE[s]} className="shrink-0">
                            {STATUS_LABELS[s]}
                          </Badge>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {unappliedJobs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Jobs seen
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2 text-sm">
                  {unappliedJobs.map((j) => (
                    <li
                      key={j.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{j.title}</div>
                        <div className="text-xs text-muted-foreground">
                          Seen {shortDate(j.createdAt)}
                        </div>
                      </div>
                      <a
                        href={j.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Source <ExternalLink className="size-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {company.notesMd ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                  {company.notesMd}
                </pre>
              ) : (
                <EmptyState
                  icon={StickyNote}
                  title="No notes yet."
                  description="Use the edit dialog to add notes about this company."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Interest
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CompanyInterestPicker companyId={company.id} level={company.interestLevel} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Stance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CompanyStancePicker companyId={company.id} current={company.stance} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <DetailRow label="HQ">
                {company.headquartersCity || company.headquartersCountry ? (
                  [company.headquartersCity, company.headquartersCountry]
                    .filter(Boolean)
                    .join(', ')
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </DetailRow>
              <DetailRow label="Size">{company.size ?? <span className="text-muted-foreground">—</span>}</DetailRow>
              <DetailRow label="Stage">
                {company.stage ? (
                  <span className="capitalize">{company.stage.replace(/_/g, ' ')}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </DetailRow>
              {company.techStack.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Tech stack</div>
                  <div className="flex flex-wrap gap-1.5">
                    {company.techStack.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {contacts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border px-3 py-2 transition-colors hover:bg-accent/30"
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.role, c.email].filter(Boolean).join(' · ') || 'No role'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Link
          href="/companies"
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          <Building2 className="size-3" />
          Back to companies
        </Link>
      </div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground/90">{children}</span>
    </div>
  )
}

// Keep unused-import silent for Briefcase reserved for future "Applications empty state" icon.
void Briefcase
