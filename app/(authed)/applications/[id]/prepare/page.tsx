import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { loadPrepareView } from '@/lib/apply/prepare-view'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { PreparePanel } from '@/components/apply/prepare/prepare-panel'
import { STATUS_BADGE, STATUS_LABELS, APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/ui/status'

export const dynamic = 'force-dynamic'

function narrow(s: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s) ? (s as ApplicationStatus) : 'saved'
}

export default async function PrepareApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId()
  const { id } = await params
  const view = await loadPrepareView(userId, id)
  if (!view) notFound()
  const status = narrow(view.status)
  const name = view.companyName ? `${view.companyName} — ${view.jobTitle}` : view.jobTitle

  return (
    <div className="max-w-3xl space-y-6">
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: 'Apply' },
          { label: 'Applications', href: '/applications' },
          { label: name, href: `/applications/${view.applicationId}` },
          { label: 'Prepare' },
        ]}
      />
      <PageHeader title="Prepare application" description={name} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4" aria-hidden="true" />
          lee drafts; you review and apply yourself. Nothing is sent.
        </span>
        <Link href={`/applications/${view.applicationId}`} className="font-medium text-primary underline-offset-2 hover:underline">
          Application details
        </Link>
      </div>
      <PreparePanel view={view} />
    </div>
  )
}
