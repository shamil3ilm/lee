import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export default function LearnPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Lab"
        description="Practice for interviews and keep growing as an engineer."
      />
      <EmptyState
        icon={GraduationCap}
        title="Learning Lab — coming soon"
        description="Tracks, exercises, and spaced-repetition review are on the way. Meanwhile, try the decision playground."
        action={
          <Button asChild size="sm">
            <Link href="/playground/decisions">Open Decisions</Link>
          </Button>
        }
      />
    </div>
  )
}
