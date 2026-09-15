import Link from 'next/link'
import { Building2, Globe, MapPin } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as companiesQ from '@/lib/db/queries/companies'
import { AddCompanyDialog } from '@/components/add-company-dialog'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { InterestStars } from '@/components/interest-stars'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function stanceVariant(stance: string | null): BadgeProps['variant'] {
  switch (stance) {
    case 'target':
      return 'emerald'
    case 'watching':
      return 'blue'
    case 'passive':
      return 'neutral'
    default:
      return 'secondary'
  }
}

export default async function CompaniesPage() {
  const userId = await requireUserId()
  const rows = await companiesQ.listWatched(userId)
  return (
    <div>
      <PageHeader
        title="Companies"
        description={`${rows.length} watched`}
        actions={<AddCompanyDialog />}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No watched companies yet."
          description="Add companies you're targeting to keep them in view."
          action={<AddCompanyDialog />}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/companies/${c.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="h-full transition-all hover:border-primary/50 hover:bg-accent/30 hover:shadow-md">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold leading-tight">{c.name}</div>
                        {c.domain ? (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="size-3" />
                            <span className="truncate">{c.domain}</span>
                          </div>
                        ) : null}
                      </div>
                      {c.stance ? (
                        <Badge variant={stanceVariant(c.stance)} className="shrink-0 capitalize">
                          {c.stance}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {c.headquartersCountry ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="size-3" />
                          {c.headquartersCountry}
                        </span>
                      ) : null}
                      {c.size ? <Badge variant="outline">{c.size}</Badge> : null}
                      {c.stage ? (
                        <Badge variant="outline" className="capitalize">
                          {c.stage.replace(/_/g, ' ')}
                        </Badge>
                      ) : null}
                    </div>
                    {c.interestLevel ? <InterestStars level={c.interestLevel} /> : null}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
