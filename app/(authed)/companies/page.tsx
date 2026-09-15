import Link from 'next/link'
import { Building2, Globe, MapPin } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as companiesQ from '@/lib/db/queries/companies'
import { AddCompanyDialog } from '@/components/add-company-dialog'
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
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Building2 className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No watched companies yet.</p>
          <AddCompanyDialog />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/companies/${c.id}`} className="block">
                <Card className="h-full transition-colors hover:border-foreground/30">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold leading-tight">{c.name}</div>
                        {c.domain ? (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="size-3" />
                            {c.domain}
                          </div>
                        ) : null}
                      </div>
                      {c.stance ? (
                        <Badge variant={stanceVariant(c.stance)} className="capitalize">
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

