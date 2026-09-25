import { PageHeader } from '@/components/page-header'
import { NewApplicationForm } from '@/components/new-application-form'
import { Card, CardContent } from '@/components/ui/card'

/**
 * `?url=<encoded>` is supported so the ⌘K command menu can hand off a
 * pasted URL directly. The form pre-fills the paste input and moves focus
 * to the submit button so a single Enter tap completes the add.
 */
interface NewApplicationPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default async function NewApplicationPage({ searchParams }: NewApplicationPageProps) {
  const sp = (await searchParams) ?? {}
  const rawUrl = firstParam(sp.url)
  const prefillUrl = rawUrl && isSafeUrl(rawUrl) ? rawUrl : undefined
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add application"
        description="Paste a job posting URL — or enter details manually."
      />
      <Card>
        <CardContent className="pt-6">
          <NewApplicationForm prefillUrl={prefillUrl} autoSubmit={Boolean(prefillUrl)} />
        </CardContent>
      </Card>
    </div>
  )
}
