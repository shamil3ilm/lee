import { PageHeader } from '@/components/page-header'
import { NewApplicationForm } from '@/components/new-application-form'
import { Card, CardContent } from '@/components/ui/card'

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add application"
        description="Paste a job posting URL — or enter details manually."
      />
      <Card>
        <CardContent className="pt-6">
          <NewApplicationForm />
        </CardContent>
      </Card>
    </div>
  )
}
