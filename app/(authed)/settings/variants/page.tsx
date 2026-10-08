import Link from 'next/link'
import { Grid3x3, TrendingDown } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { shortDate } from '@/lib/ui/date'
import { acceptedFamilies } from '@/lib/variants/service'
import { starterOptions } from '@/lib/variants/starter'
import { isRegion, REGION_LABELS } from '@/lib/variants/types'
import { loadMatrix, type MatrixView } from '@/lib/cv-fit/matrix'
import { logger } from '@/lib/logger'
import { PageHeader } from '@/components/page-header'
import { CollapsibleSection } from '@/components/collapsible-section'
import { CreateVariantForm } from '@/components/variants/create-variant-form'
import { StarterSetCard } from '@/components/cv-fit/starter-set-card'
import { VariantMatrix } from '@/components/cv-fit/variant-matrix'
import { RecurringGaps } from '@/components/cv-fit/recurring-gaps'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const EMPTY_MATRIX: MatrixView = { variants: [], rows: [], bestCounts: {}, gaps: [] }

export default async function VariantsPage({ searchParams }: { searchParams: Promise<{ region?: string; family?: string }> }) {
  const userId = await requireUserId()
  const [variants, families, sp, matrix] = await Promise.all([
    variantsQ.list(userId),
    acceptedFamilies(userId),
    searchParams,
    loadMatrix(userId).catch((err: unknown) => {
      logger.warn('variant_matrix_failed', { err: err instanceof Error ? err.message : String(err) })
      return EMPTY_MATRIX
    }),
  ])
  const starters = starterOptions(
    families.map((f) => f.id),
    variants,
  ).map((g) => ({ role: { id: g.role.id, label: g.role.label, domain: g.role.domain }, options: g.options }))
  const bestOf = Object.entries(matrix.bestCounts).sort((a, b) => b[1] - a[1])[0]
  const leader = bestOf && bestOf[1] > 0 ? matrix.variants.find((v) => v.id === bestOf[0]) : undefined
  return (
    <div className="space-y-6">
      <PageHeader
        title="Résumé variants"
        description="Region × role recipes over your master profile. They hold no facts: only which items, which wording, and how it looks."
      />
      {starters.length > 0 ? (
        <StarterSetCard groups={starters} />
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Accept the roles you are after in{' '}
          <Link href="/settings/search?from=/settings/variants" className="font-medium text-primary underline-offset-2 hover:underline">
            Search preferences
          </Link>{' '}
          to get a starter CV set for them.
        </p>
      )}
      <CreateVariantForm families={families} initialRegion={isRegion(sp.region) ? sp.region : undefined} initialFamily={sp.family ?? ''} />
      {variants.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No variants yet. Create one for the next job you apply to.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Variants">
          {variants.map((v) => (
            <li key={v.id}>
              <Card className="h-full">
                <CardContent className="space-y-2 pt-5">
                  <Link href={`/settings/variants/${v.id}`} className="block break-words font-medium hover:underline">
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
      <CollapsibleSection
        id="coverage"
        title="Which CV covers which jobs"
        icon={<Grid3x3 className="size-4" aria-hidden="true" />}
        count={matrix.rows.length}
        summary={leader ? `${leader.name} is the best CV for ${bestOf![1]} of ${matrix.rows.length} open postings` : 'Fit of each variant for your open postings'}
        collapseOnMobile
      >
        <VariantMatrix view={matrix} />
      </CollapsibleSection>
      <CollapsibleSection
        id="gaps"
        title="Top recurring missing must-haves this month"
        icon={<TrendingDown className="size-4" aria-hidden="true" />}
        count={matrix.gaps.length}
        summary="Study suggestions: never added to a CV"
        collapseOnMobile
      >
        <RecurringGaps gaps={matrix.gaps} />
      </CollapsibleSection>
    </div>
  )
}
