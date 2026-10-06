import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import { ROLE_FAMILIES } from '@/lib/discovery/relevance/roles'
import { getResumeProfile } from '@/lib/resume/service'
import { shortDate } from '@/lib/ui/date'
import { acceptedFamilies, loadVariant, VariantError } from '@/lib/variants/service'
import { PageHeader } from '@/components/page-header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { VariantEditor } from '@/components/variants/variant-editor'

export const dynamic = 'force-dynamic'

export default async function VariantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await requireUserId()
  const loaded = await loadVariant(userId, id).catch((err: unknown) => {
    if (err instanceof VariantError) return null
    throw err
  })
  if (!loaded || loaded.variant.archivedAt) notFound()
  const [{ profile }, accepted, versions] = await Promise.all([
    getResumeProfile(userId),
    acceptedFamilies(userId),
    variantsQ.listVersions(userId, id),
  ])
  // The variant's own family stays selectable even if no longer accepted.
  const own = loaded.recipe.roleFamily ? ROLE_FAMILIES.find((f) => f.id === loaded.recipe.roleFamily) : undefined
  const families = own && !accepted.some((f) => f.id === own.id) ? [...accepted, { id: own.id, label: own.label }] : accepted
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Variants', href: '/settings/profile/variants' }, { label: loaded.variant.name }]}
      />
      <PageHeader
        title={loaded.variant.name}
        description={`Version ${loaded.version} · ${versions.length} version(s) since ${shortDate(versions[0]?.createdAt ?? loaded.variant.createdAt)}. Applications keep the version they used.`}
      />
      <VariantEditor
        key={`${id}-${loaded.version}`}
        variantId={id}
        version={loaded.version}
        initialName={loaded.variant.name}
        initialPublish={loaded.variant.publishToPortfolio}
        initialRecipe={loaded.recipe}
        profile={profile}
        families={families}
      />
    </div>
  )
}
