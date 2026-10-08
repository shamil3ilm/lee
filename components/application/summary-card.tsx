import { Building2, ExternalLink, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { RiskBadge } from '@/components/scam/risk-badge'
import type { RiskView } from '@/lib/scam/view'
import { STATUS_BADGE, STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'
import { workModeLabel } from '@/lib/ui/labels'

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

const EMPLOYMENT_LABELS: Record<string, string> = {
  fulltime: 'Full-time',
  full_time: 'Full-time',
  parttime: 'Part-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  temporary: 'Temporary',
}

function employmentLabel(value: string): string {
  return EMPLOYMENT_LABELS[value.toLowerCase()] ?? value.replace(/_/g, ' ')
}

interface SummaryJob {
  company: { name: string } | null
  location: string | null
  remoteType: string | null
  employmentType: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  sourceUrl: string | null
}

interface ApplicationSummaryCardProps {
  id?: string
  className?: string
  status: ApplicationStatus
  risk: RiskView | null
  job: SummaryJob
}

/** Application detail › Overview: status, risk, place, work mode, pay and the posting link. */
export function ApplicationSummaryCard({ id, className, status, risk, job }: ApplicationSummaryCardProps) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)
  return (
  <Card id={id} className={className}>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-sm">
        <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
        {risk ? <RiskBadge risk={risk} /> : null}
        {job.company ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="size-3.5" />
            {job.company.name}
          </span>
        ) : null}
        {job.location ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5" />
            {job.location}
          </span>
        ) : null}
        {workModeLabel(job.remoteType) ? (
          <Badge variant="outline">{workModeLabel(job.remoteType)}</Badge>
        ) : null}
        {job.employmentType ? (
          <Badge variant="outline">
            {employmentLabel(job.employmentType)}
          </Badge>
        ) : null}
        {salary ? <span className="font-medium">{salary}</span> : null}
        {job.sourceUrl ? (
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Source <ExternalLink className="size-3" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}
