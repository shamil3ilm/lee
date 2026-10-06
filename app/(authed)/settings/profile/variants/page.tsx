import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { shortDate } from '@/lib/ui/date'
import { acceptedFamilies } from '@/lib/variants/service'
import { isRegion, REGION_LABELS } from '@/lib/variants/types'
import { PageHeader } from '@/components/page-header'
import { CreateVariantForm } from '@/components/variants/create-variant-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function VariantsPage({ searchParams }: { searchParams: Promise<{ region?: string; family?: string }> }) {
  const userId = await requireUserId()
  const [variants, families, sp] = await Promise.all([variantsQ.list(userId), acceptedFamilies(userId), searchParams])
  return (
    <div className="space-y-6">
      <PageHeader
        title="Résumé variants"
        description="Region × role recipes over your master profile. They hold no facts: only which items, which wording, and how it looks."
      />
      <CreateVariantForm families={families} initialRegion={isRegion(sp.region) ? sp.region : undefined} initialFamily={sp.family ?? ''} />
      {variants.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No variants yet. Create one for the next job you apply to.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Variants">
          {variants.map((v) => (
            <li key={v.id}>
              <Card className="h-full">
                <CardContent className="space-y-2 pt-5">
                  <Link href={`/settings/profile/variants/${v.id}`} className="block break-words font-medium hover:underline">
                    {v.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="info">{isRegion(v.region) ? REGION_LABELS[v.region] : v.region}</Badge>
                    {v.roleFamily ? <Badge variant="neutral">{roleFamilyLabel(v.roleFamily)}</Badge> : null}
                    <Badge variant="outline">v{v.currentVersion}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Updated {shortDate(v.updatedAt)}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
