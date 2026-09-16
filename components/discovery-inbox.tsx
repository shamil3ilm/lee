import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import {
  JobDiscoveryRow,
  CompanyDiscoveryRow,
  type DiscoveryRowJob,
  type DiscoveryRowCompany,
} from '@/components/discovery-row'

interface JobsInboxProps {
  kind: 'jobs'
  items: DiscoveryRowJob[]
}

interface CompaniesInboxProps {
  kind: 'companies'
  items: DiscoveryRowCompany[]
}

type DiscoveryInboxProps = JobsInboxProps | CompaniesInboxProps

export function DiscoveryInbox(props: DiscoveryInboxProps) {
  if (props.items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No discoveries here"
        description="Add sources at Settings → Sources to start feeding the pipeline."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/sources">Manage sources</Link>
          </Button>
        }
      />
    )
  }
  return (
    <div className="space-y-2">
      {props.kind === 'jobs'
        ? props.items.map((it) => <JobDiscoveryRow key={it.id} item={it} />)
        : props.items.map((it) => <CompanyDiscoveryRow key={it.id} item={it} />)}
    </div>
  )
}
