'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { archiveVariantAction, saveVariantAction } from '@/app/(authed)/settings/profile/variants/actions'
import { Button } from '@/components/ui/button'
import type { ResumeProfile } from '@/lib/resume/types'
import { toPlainText } from '@/lib/variants/export'
import { renderVariant } from '@/lib/variants/render'
import type { Recipe } from '@/lib/variants/types'
import { VariantItemsCard } from './variant-items-card'
import { VariantListsCard } from './variant-lists-card'
import { VariantOutputs } from './variant-outputs'
import { VariantPreview } from './variant-preview'
import { VariantProposal } from './variant-proposal'
import { VariantSettingsCard } from './variant-settings-card'

interface VariantEditorProps {
  variantId: string
  version: number
  initialName: string
  initialPublish: boolean
  initialRecipe: Recipe
  profile: ResumeProfile
  families: Array<{ id: string; label: string }>
}

export function VariantEditor({ variantId, version, initialName, initialPublish, initialRecipe, profile, families }: VariantEditorProps) {
  const router = useRouter()
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe)
  const [name, setName] = useState(initialName)
  const [publish, setPublish] = useState(initialPublish)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const rendered = useMemo(() => renderVariant(profile, recipe), [profile, recipe])
  const plainText = useMemo(() => toPlainText(rendered), [rendered])

  const change = (next: Recipe): void => {
    setRecipe(next)
    setDirty(true)
  }

  const save = (): void =>
    start(async () => {
      const r = await saveVariantAction(variantId, recipe, { name, publishToPortfolio: publish })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setDirty(false)
      toast.success(r.changed ? `Saved as version ${r.version}` : 'Saved')
      router.refresh()
    })

  const archive = (): void =>
    start(async () => {
      const r = await archiveVariantAction(variantId)
      if ('error' in r) toast.error(r.error)
      else router.push('/settings/profile/variants')
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">Version {version}{dirty ? ' · unsaved changes' : ''}</span>
        <Button type="button" variant="ghost" size="sm" onClick={archive} disabled={pending}>
          <Archive /> Archive
        </Button>
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Save variant
        </Button>
      </div>
      <VariantSettingsCard
        name={name}
        onName={(v) => {
          setName(v)
          setDirty(true)
        }}
        publishToPortfolio={publish}
        onPublish={(v) => {
          setPublish(v)
          setDirty(true)
        }}
        recipe={recipe}
        onChange={change}
        families={families}
      />
      <VariantItemsCard profile={profile} recipe={recipe} onChange={change} />
      <VariantListsCard profile={profile} recipe={recipe} onChange={change} />
      <VariantPreview rendered={rendered} lengthTarget={recipe.lengthTarget} />
      <VariantProposal variantId={variantId} dirty={dirty} />
      <VariantOutputs variantId={variantId} plainText={plainText} dirty={dirty} />
    </div>
  )
}
